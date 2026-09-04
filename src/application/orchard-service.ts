import type { ApplicationDependencies, Transaction } from "./ports.js";
import type {
  ActorContext,
  ChildTree,
  FruitCollection,
  GrowthCard,
  TreeCatalog,
} from "../domain/model.js";
import { DEFAULT_TREE_CATALOGS, applySunlight, growthStageFor } from "../domain/orchard.js";
import { AccessPolicy } from "../domain/policy.js";
import { assertPositiveSunlight } from "../domain/rewards.js";
import { DomainError } from "../shared/errors.js";

interface RequestBase {
  readonly requestId: string;
}

export interface OrchardView {
  readonly lifetimeSunlight: number;
  readonly currentTree?: ChildTree;
  readonly harvestedTrees: readonly ChildTree[];
  readonly fruits: readonly FruitCollection[];
  readonly growthCards: readonly GrowthCard[];
}

export interface HarvestResult {
  readonly tree: ChildTree;
  readonly fruit: FruitCollection;
  readonly growthCard: GrowthCard;
}

export class OrchardService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async applySunlightInTransaction(
    tx: Transaction,
    childId: string,
    amount: number,
  ): Promise<ChildTree> {
    assertPositiveSunlight(amount);
    await this.ensureDefaultCatalogs(tx);
    const activeTrees = await tx.query(
      "childTrees",
      (tree) => tree.childId === childId && (tree.status === "GROWING" || tree.status === "MATURE"),
    );
    let tree = activeTrees.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (tree === undefined) {
      const catalog = await this.requireCatalog(tx, "starter-apple");
      tree = await tx.insert(
        "childTrees",
        this.newTree(childId, catalog, this.dependencies.clock.now()),
      );
    }
    if (tree.status === "MATURE") {
      return tx.update("childTrees", tree.id, {
        carryOver: tree.carryOver + amount,
        updatedAt: this.dependencies.clock.now(),
      });
    }
    const catalog = await this.requireCatalog(tx, tree.catalogId);
    const applied = applySunlight(tree, catalog, amount, this.dependencies.clock.now());
    return tx.update("childTrees", tree.id, applied.tree);
  }

  async startTree(
    actor: ActorContext,
    input: RequestBase & { readonly catalogId: string },
  ): Promise<ChildTree> {
    const childId = await this.requireSelectedChild(actor);
    requireRequestId(input.requestId);
    const existing = await this.dependencies.repository.query(
      "childTrees",
      (tree) => tree.childId === childId && (tree.status === "GROWING" || tree.status === "MATURE"),
    );
    if (existing.length > 0) {
      throw new DomainError("CONFLICT", "请先采摘当前成熟果树");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      await this.ensureDefaultCatalogs(tx);
      const catalog = await this.requireCatalog(tx, input.catalogId);
      const harvested = (await tx.query("childTrees", { childId, status: "HARVESTED" })).sort(
        (left, right) => right.updatedAt.localeCompare(left.updatedAt),
      );
      const carrySource = harvested.find((tree) => tree.carryOver > 0);
      const carryOver = carrySource?.carryOver ?? 0;
      let tree = this.newTree(childId, catalog, now);
      if (carryOver > 0) {
        tree = applySunlight(tree, catalog, carryOver, now).tree;
        if (carrySource !== undefined) {
          await tx.update("childTrees", carrySource.id, { carryOver: 0, updatedAt: now });
        }
      }
      await tx.insert("childTrees", tree);
      await this.audit(tx, actor, input.requestId, "CHILD_TREE_STARTED", tree.id);
      return tree;
    });
  }

  async renameTree(
    actor: ActorContext,
    input: RequestBase & { readonly treeId: string; readonly name: string },
  ): Promise<ChildTree> {
    const childId = await this.requireSelectedChild(actor);
    requireRequestId(input.requestId);
    const name = input.name.trim();
    if (name.length < 1 || name.length > 20) {
      throw new DomainError("INVALID_INPUT", "果树名字长度必须是 1 至 20 个字符");
    }
    const tree = await this.dependencies.repository.read("childTrees", input.treeId);
    if (tree?.childId !== childId) {
      throw new DomainError("FORBIDDEN", "只能命名自己的果树");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const renamed = await tx.update("childTrees", tree.id, { name, updatedAt: now });
      await this.audit(tx, actor, input.requestId, "CHILD_TREE_RENAMED", tree.id);
      return renamed;
    });
  }

  async harvestTree(
    actor: ActorContext,
    input: RequestBase & { readonly treeId: string; readonly name?: string },
  ): Promise<HarvestResult> {
    const childId = await this.requireSelectedChild(actor);
    requireRequestId(input.requestId);
    const repeatedCard = (
      await this.dependencies.repository.query("growthCards", {
        requestId: input.requestId,
        treeId: input.treeId,
      })
    )[0];
    if (repeatedCard !== undefined) {
      const repeatedTree = await this.dependencies.repository.read("childTrees", input.treeId);
      const repeatedFruit = (
        await this.dependencies.repository.query("fruitCollections", {
          catalogId: repeatedCard.catalogId,
          childId,
        })
      )[0];
      if (repeatedTree === undefined || repeatedFruit === undefined) {
        throw new DomainError("CONFLICT", "采摘记录不完整");
      }
      return { fruit: repeatedFruit, growthCard: repeatedCard, tree: repeatedTree };
    }
    const tree = await this.dependencies.repository.read("childTrees", input.treeId);
    if (tree?.childId !== childId) {
      throw new DomainError("FORBIDDEN", "只能采摘自己的果树");
    }
    if (tree.status !== "MATURE" || tree.maturedAt === undefined) {
      throw new DomainError("CONFLICT", "果树尚未成熟");
    }
    const catalog = await this.dependencies.repository.read("treeCatalog", tree.catalogId);
    if (catalog === undefined) {
      throw new DomainError("NOT_FOUND", "果树目录不存在");
    }
    const title = input.name?.trim() || tree.name || catalog.name;
    if (title.length > 20) {
      throw new DomainError("INVALID_INPUT", "果树名字长度不能超过 20 个字符");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const harvested = await tx.update("childTrees", tree.id, {
        harvestedAt: now,
        name: title,
        status: "HARVESTED",
        updatedAt: now,
      });
      let fruit = (await tx.query("fruitCollections", { catalogId: catalog.id, childId }))[0];
      if (fruit === undefined) {
        fruit = await tx.insert("fruitCollections", {
          id: this.dependencies.ids.next("fruit"),
          catalogId: catalog.id,
          childId,
          createdAt: now,
          quantity: 1,
          reservedQuantity: 0,
          updatedAt: now,
        });
      } else {
        fruit = await tx.update("fruitCollections", fruit.id, {
          quantity: fruit.quantity + 1,
          updatedAt: now,
        });
      }
      const growthCard = await tx.insert("growthCards", {
        id: this.dependencies.ids.next("growth_card"),
        catalogId: catalog.id,
        childId,
        createdAt: now,
        harvestedAt: now,
        maturedAt: tree.maturedAt ?? now,
        requestId: input.requestId,
        title,
        treeId: tree.id,
      });
      await this.audit(tx, actor, input.requestId, "CHILD_TREE_HARVESTED", tree.id);
      return { fruit, growthCard, tree: harvested };
    });
  }

  async orchardForChild(actor: ActorContext): Promise<OrchardView> {
    const childId = await this.requireSelectedChild(actor);
    const trees = await this.dependencies.repository.query("childTrees", { childId });
    const ledgers = await this.dependencies.repository.query("sunlightLedgers", { childId });
    const fruits = await this.dependencies.repository.query("fruitCollections", { childId });
    const growthCards = await this.dependencies.repository.query("growthCards", { childId });
    const currentTree = trees
      .filter((tree) => tree.status === "GROWING" || tree.status === "MATURE")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return {
      ...(currentTree === undefined ? {} : { currentTree }),
      fruits,
      growthCards,
      harvestedTrees: trees.filter((tree) => tree.status === "HARVESTED"),
      lifetimeSunlight: ledgers.reduce((total, ledger) => total + ledger.amount, 0),
    };
  }

  private async ensureDefaultCatalogs(tx: Transaction): Promise<void> {
    for (const catalog of DEFAULT_TREE_CATALOGS) {
      if ((await tx.read("treeCatalog", catalog.id)) === undefined) {
        await tx.insert("treeCatalog", structuredClone(catalog));
      }
    }
  }

  private async requireCatalog(tx: Transaction, catalogId: string): Promise<TreeCatalog> {
    const catalog = await tx.read("treeCatalog", catalogId);
    if (catalog?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "果树目录不存在或已停用");
    }
    return catalog;
  }

  private newTree(childId: string, catalog: TreeCatalog, now: string): ChildTree {
    return {
      id: this.dependencies.ids.next("child_tree"),
      carryOver: 0,
      catalogId: catalog.id,
      childId,
      createdAt: now,
      progress: 0,
      stage: growthStageFor(catalog, 0),
      status: "GROWING",
      updatedAt: now,
    };
  }

  private async requireSelectedChild(actor: ActorContext): Promise<string> {
    if (actor.mode !== "CHILD" || actor.childId === undefined) {
      throw new DomainError("FORBIDDEN", "需要选择孩子身份");
    }
    await this.policy.requireGuardian(actor, actor.childId);
    return actor.childId;
  }

  private async audit(
    tx: Transaction,
    actor: ActorContext,
    requestId: string,
    action: string,
    resourceId: string,
  ): Promise<void> {
    const guardian =
      actor.childId === undefined
        ? undefined
        : await this.policy.requireGuardian(actor, actor.childId);
    await tx.appendAudit({
      id: this.dependencies.ids.next("audit"),
      action,
      actorAccountId: actor.accountId,
      createdAt: this.dependencies.clock.now(),
      metadata: {},
      requestId,
      resourceId,
      resourceType: action,
      tenantScope:
        guardian === undefined
          ? { kind: "PLATFORM" }
          : { kind: "FAMILY", familyId: guardian.familyId },
    });
  }
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
