import type { ApplicationDependencies, Transaction } from "./ports.js";
import type {
  ActorContext,
  Group,
  GroupContribution,
  GroupMemorial,
  GroupTree,
  TaskAssignment,
  TreeCatalog,
} from "../domain/model.js";
import { applyGroupContribution, defaultGroupTreeThreshold } from "../domain/group-orchard.js";
import { DEFAULT_TREE_CATALOGS, growthStageFor } from "../domain/orchard.js";
import { AccessPolicy } from "../domain/policy.js";
import { DomainError } from "../shared/errors.js";

interface RequestBase {
  readonly requestId: string;
}

export interface ChildGroupProgressView {
  readonly treeId: string;
  readonly progress: number;
  readonly threshold: number;
  readonly stage: string;
  readonly status: GroupTree["status"];
}

export interface GroupHarvestResult {
  readonly tree: GroupTree;
  readonly memorial: GroupMemorial;
}

export class GroupOrchardService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async startGroupTree(
    actor: ActorContext,
    input: RequestBase & { readonly groupId: string; readonly catalogId: string },
  ): Promise<GroupTree> {
    requireRequestId(input.requestId);
    const group = await this.requireManagedGroup(actor, input.groupId);
    const active = await this.dependencies.repository.query(
      "groupTrees",
      (tree) =>
        tree.groupId === group.id && (tree.status === "GROWING" || tree.status === "MATURE"),
    );
    if (active.length > 0) {
      throw new DomainError("CONFLICT", "分组已有正在共育的果树");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      await this.ensureDefaultCatalogs(tx);
      const catalog = await this.requireCatalog(tx, input.catalogId);
      const threshold = defaultGroupTreeThreshold(catalog);
      const stageCatalog = { ...catalog, threshold };
      const tree: GroupTree = {
        id: this.dependencies.ids.next("group_tree"),
        catalogId: catalog.id,
        createdAt: now,
        groupId: group.id,
        organizationId: group.organizationId,
        progress: 0,
        stage: growthStageFor(stageCatalog, 0),
        status: "GROWING",
        threshold,
        updatedAt: now,
      };
      await tx.insert("groupTrees", tree);
      await tx.update("groups", group.id, { coGrowingEnabled: true, updatedAt: now });
      await this.audit(tx, actor, input.requestId, "GROUP_TREE_STARTED", group, tree.id);
      return tree;
    });
  }

  async contributeForAcademicApproval(
    tx: Transaction,
    assignment: TaskAssignment,
  ): Promise<GroupContribution | undefined> {
    if (
      assignment.organizationId === undefined ||
      assignment.groupId === undefined ||
      assignment.organizationMemberId === undefined
    ) {
      return undefined;
    }
    const group = await tx.read("groups", assignment.groupId);
    if (group?.coGrowingEnabled !== true || group.status !== "ACTIVE") {
      return undefined;
    }
    const tree = (
      await tx.query(
        "groupTrees",
        (candidate) => candidate.groupId === group.id && candidate.status === "GROWING",
      )
    )[0];
    if (tree === undefined) {
      return undefined;
    }
    const existing = (
      await tx.query("groupContributions", {
        assignmentId: assignment.id,
        groupTreeId: tree.id,
      })
    )[0];
    if (existing !== undefined) {
      return existing;
    }
    const catalog = await this.requireCatalog(tx, tree.catalogId);
    const now = this.dependencies.clock.now();
    const contribution: GroupContribution = {
      id: this.dependencies.ids.next("group_contribution"),
      amount: 1,
      assignmentId: assignment.id,
      createdAt: now,
      groupId: group.id,
      groupTreeId: tree.id,
      organizationId: group.organizationId,
      organizationMemberId: assignment.organizationMemberId,
    };
    await tx.insert("groupContributions", contribution);
    await tx.update("groupTrees", tree.id, applyGroupContribution(tree, catalog, 1, now));
    return contribution;
  }

  async groupProgressForChild(
    actor: ActorContext,
    groupId: string,
  ): Promise<ChildGroupProgressView> {
    if (actor.mode !== "CHILD" || actor.childId === undefined) {
      throw new DomainError("FORBIDDEN", "需要选择孩子身份");
    }
    await this.policy.requireGuardian(actor, actor.childId);
    const memberships = await this.dependencies.repository.query("childGroupMemberships", {
      childId: actor.childId,
      groupId,
      status: "ACTIVE",
    });
    if (memberships.length === 0) {
      throw new DomainError("FORBIDDEN", "孩子不是该分组的有效成员");
    }
    const tree = (
      await this.dependencies.repository.query(
        "groupTrees",
        (candidate) =>
          candidate.groupId === groupId &&
          (candidate.status === "GROWING" || candidate.status === "MATURE"),
      )
    )[0];
    if (tree === undefined) {
      throw new DomainError("NOT_FOUND", "分组尚未开启共育果树");
    }
    return {
      progress: tree.progress,
      stage: tree.stage,
      status: tree.status,
      threshold: tree.threshold,
      treeId: tree.id,
    };
  }

  async harvestGroupTree(
    actor: ActorContext,
    input: RequestBase & { readonly groupTreeId: string; readonly title: string },
  ): Promise<GroupHarvestResult> {
    requireRequestId(input.requestId);
    const repeated = (
      await this.dependencies.repository.query("groupMemorials", {
        groupTreeId: input.groupTreeId,
        requestId: input.requestId,
      })
    )[0];
    if (repeated !== undefined) {
      const tree = await this.dependencies.repository.read("groupTrees", input.groupTreeId);
      if (tree === undefined) {
        throw new DomainError("CONFLICT", "分组纪念记录缺少果树");
      }
      return { memorial: repeated, tree };
    }
    const tree = await this.dependencies.repository.read("groupTrees", input.groupTreeId);
    if (tree?.status !== "MATURE") {
      throw new DomainError("CONFLICT", "分组果树尚未成熟");
    }
    const group = await this.requireManagedGroup(actor, tree.groupId);
    const title = input.title.trim();
    if (title.length < 1 || title.length > 40) {
      throw new DomainError("INVALID_INPUT", "分组纪念标题长度必须是 1 至 40 个字符");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const harvested = await tx.update("groupTrees", tree.id, {
        harvestedAt: now,
        status: "HARVESTED",
        updatedAt: now,
      });
      const memorial = await tx.insert("groupMemorials", {
        id: this.dependencies.ids.next("group_memorial"),
        createdAt: now,
        groupId: group.id,
        groupTreeId: tree.id,
        organizationId: group.organizationId,
        requestId: input.requestId,
        title,
      });
      await this.audit(tx, actor, input.requestId, "GROUP_TREE_HARVESTED", group, tree.id);
      return { memorial, tree: harvested };
    });
  }

  private async requireManagedGroup(actor: ActorContext, groupId: string): Promise<Group> {
    const group = await this.dependencies.repository.read("groups", groupId);
    if (group?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "分组不存在或已停用");
    }
    try {
      await this.policy.requireOrganizationRole(actor, group.organizationId, [
        "ORGANIZATION_ADMIN",
      ]);
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "FORBIDDEN") {
        throw error;
      }
      await this.policy.requireGroupRole(actor, group.id);
    }
    return group;
  }

  private async ensureDefaultCatalogs(tx: Transaction): Promise<void> {
    for (const catalog of DEFAULT_TREE_CATALOGS) {
      if ((await tx.read("treeCatalog", catalog.id)) === undefined) {
        await tx.insert("treeCatalog", structuredClone(catalog));
      }
    }
  }

  private async requireCatalog(
    tx: Pick<Transaction, "read">,
    catalogId: string,
  ): Promise<TreeCatalog> {
    const catalog = await tx.read("treeCatalog", catalogId);
    if (catalog?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "果树目录不存在或已停用");
    }
    return catalog;
  }

  private async audit(
    tx: Transaction,
    actor: ActorContext,
    requestId: string,
    action: string,
    group: Group,
    resourceId: string,
  ): Promise<void> {
    await tx.appendAudit({
      id: this.dependencies.ids.next("audit"),
      action,
      actorAccountId: actor.accountId,
      createdAt: this.dependencies.clock.now(),
      metadata: {},
      requestId,
      resourceId,
      resourceType: action,
      tenantScope: { kind: "ORGANIZATION", organizationId: group.organizationId },
    });
  }
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
