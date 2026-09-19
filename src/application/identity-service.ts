import type { ApplicationDependencies, Transaction } from "./ports.js";
import type {
  Account,
  ActorContext,
  Child,
  Family,
  Group,
  GroupRoleBinding,
  Organization,
  OrganizationType,
  GroupType,
  TenantScope,
} from "../domain/model.js";
import { AccessPolicy } from "../domain/policy.js";
import { DomainError } from "../shared/errors.js";
import { TeacherActivationService } from "./teacher-activation-service.js";

interface RequestBase {
  readonly requestId: string;
}

export interface OrganizationChildView {
  readonly organizationMemberId: string;
  readonly displayName: string;
  readonly grade: number | undefined;
}

export class IdentityService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async activateTeacherWorkspace(
    actor: ActorContext,
    input: RequestBase & { readonly code: string; readonly workspaceName: string },
  ): Promise<Organization> {
    if (typeof input.workspaceName !== "string")
      throw new DomainError("INVALID_INPUT", "工作空间名称无效");
    requireName(input.workspaceName, "工作空间名称");
    return new TeacherActivationService(this.dependencies).consume(
      actor,
      input.code,
      input.requestId,
      async (tx) => {
        const now = this.dependencies.clock.now();
        const workspace: Organization = {
          id: this.dependencies.ids.next("organization"),
          createdAt: now,
          name: input.workspaceName.trim(),
          status: "ACTIVE",
          type: "TEACHER_WORKSPACE",
          updatedAt: now,
        };
        await tx.insert("organizations", workspace);
        await tx.insert("organizationMembers", {
          id: this.dependencies.ids.next("organization_member"),
          accountId: actor.accountId,
          createdAt: now,
          displayName: workspace.name,
          memberType: "ADULT",
          organizationId: workspace.id,
          organizationMemberId: this.dependencies.ids.next("organization_person"),
          organizationRole: "ORGANIZATION_ADMIN",
          status: "ACTIVE",
          updatedAt: now,
        });
        await this.audit(tx, {
          action: "TEACHER_WORKSPACE_CREATED",
          actorAccountId: actor.accountId,
          requestId: input.requestId,
          resourceId: workspace.id,
          resourceType: "ORGANIZATION",
          tenantScope: { kind: "ORGANIZATION", organizationId: workspace.id },
        });
        return workspace;
      },
    );
  }

  async createAccount(input: RequestBase & { readonly openId: string }): Promise<Account> {
    requireText(input.openId, "微信身份");
    requireRequestId(input.requestId);
    const existing = (
      await this.dependencies.repository.query("accounts", { openId: input.openId })
    )[0];
    if (existing !== undefined) {
      return existing;
    }

    const now = this.dependencies.clock.now();
    const account: Account = {
      id: this.dependencies.ids.next("account"),
      createdAt: now,
      openId: input.openId,
      status: "ACTIVE",
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("accounts", account);
      await this.audit(tx, {
        action: "ACCOUNT_CREATED",
        actorAccountId: account.id,
        requestId: input.requestId,
        resourceId: account.id,
        resourceType: "ACCOUNT",
        tenantScope: { kind: "PLATFORM" },
      });
      return account;
    });
  }

  async createFamily(
    actor: ActorContext,
    input: RequestBase & { readonly name: string },
  ): Promise<Family> {
    await this.requireActiveAccount(actor);
    requireName(input.name, "家庭名称");
    requireRequestId(input.requestId);
    const now = this.dependencies.clock.now();
    const family: Family = {
      id: this.dependencies.ids.next("family"),
      autoRewardInstitutionTasks: false,
      createdAt: now,
      defaultRewards: { challenge: 1, focus: 3, ordinary: 2, revision: 1 },
      endOfDayHour: 21,
      name: input.name.trim(),
      status: "ACTIVE",
      updatedAt: now,
    };

    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("families", family);
      await tx.insert("familyMembers", {
        id: this.dependencies.ids.next("family_member"),
        accountId: actor.accountId,
        createdAt: now,
        familyId: family.id,
        role: "FAMILY_ADMIN",
        status: "ACTIVE",
        updatedAt: now,
      });
      await this.audit(tx, {
        action: "FAMILY_CREATED",
        actorAccountId: actor.accountId,
        requestId: input.requestId,
        resourceId: family.id,
        resourceType: "FAMILY",
        tenantScope: { kind: "FAMILY", familyId: family.id },
      });
      return family;
    });
  }

  async addChild(
    actor: ActorContext,
    input: RequestBase & {
      readonly familyId: string;
      readonly nickname: string;
      readonly grade?: number;
    },
  ): Promise<Child> {
    await this.policy.requireFamilyRole(actor, input.familyId);
    requireName(input.nickname, "孩子昵称");
    requireRequestId(input.requestId);
    if (
      input.grade !== undefined &&
      (!Number.isInteger(input.grade) || input.grade < 1 || input.grade > 6)
    ) {
      throw new DomainError("INVALID_INPUT", "年级必须是 1 至 6");
    }

    const now = this.dependencies.clock.now();
    const child: Child = {
      id: this.dependencies.ids.next("child"),
      createdAt: now,
      ...(input.grade === undefined ? {} : { grade: input.grade }),
      nickname: input.nickname.trim(),
      status: "ACTIVE",
      updatedAt: now,
    };
    const activeFamilyMembers = await this.dependencies.repository.query("familyMembers", {
      familyId: input.familyId,
      status: "ACTIVE",
    });

    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("children", child);
      for (const member of activeFamilyMembers) {
        await tx.insert("guardianLinks", {
          id: this.dependencies.ids.next("guardian_link"),
          accountId: member.accountId,
          childId: child.id,
          createdAt: now,
          familyId: input.familyId,
          role: member.role === "FAMILY_ADMIN" ? "PRIMARY" : "GUARDIAN",
          status: "ACTIVE",
          updatedAt: now,
        });
      }
      await this.audit(tx, {
        action: "CHILD_ADDED",
        actorAccountId: actor.accountId,
        requestId: input.requestId,
        resourceId: child.id,
        resourceType: "CHILD",
        tenantScope: { kind: "FAMILY", familyId: input.familyId },
      });
      return child;
    });
  }

  async createOrganization(
    actor: ActorContext,
    input: RequestBase & {
      readonly adminAccountId: string;
      readonly name: string;
      readonly type: OrganizationType;
    },
  ): Promise<Organization> {
    if (actor.mode !== "PLATFORM") {
      throw new DomainError("FORBIDDEN", "只有平台运营可以创建机构");
    }
    const admin = await this.dependencies.repository.read("accounts", input.adminAccountId);
    if (admin?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "机构管理员账号不存在");
    }
    requireName(input.name, "机构名称");
    requireRequestId(input.requestId);
    const now = this.dependencies.clock.now();
    const organization: Organization = {
      id: this.dependencies.ids.next("organization"),
      createdAt: now,
      name: input.name.trim(),
      status: "ACTIVE",
      type: input.type,
      updatedAt: now,
    };

    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("organizations", organization);
      await tx.insert("organizationMembers", {
        id: this.dependencies.ids.next("organization_member"),
        accountId: input.adminAccountId,
        createdAt: now,
        displayName: input.name.trim(),
        memberType: "ADULT",
        organizationId: organization.id,
        organizationMemberId: this.dependencies.ids.next("organization_person"),
        organizationRole: "ORGANIZATION_ADMIN",
        status: "ACTIVE",
        updatedAt: now,
      });
      await this.audit(tx, {
        action: "ORGANIZATION_CREATED",
        actorAccountId: actor.accountId,
        requestId: input.requestId,
        resourceId: organization.id,
        resourceType: "ORGANIZATION",
        tenantScope: { kind: "ORGANIZATION", organizationId: organization.id },
      });
      return organization;
    });
  }

  async createGroup(
    actor: ActorContext,
    input: RequestBase & {
      readonly organizationId: string;
      readonly name: string;
      readonly type: GroupType;
    },
  ): Promise<Group> {
    await this.policy.requireOrganizationRole(actor, input.organizationId, ["ORGANIZATION_ADMIN"]);
    const organization = await this.dependencies.repository.read("organizations", input.organizationId);
    if (organization?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "机构不存在或已停用");
    }
    if (organization.type === "TEACHER_WORKSPACE" && input.type !== "LEARNING_GROUP") {
      throw new DomainError("FORBIDDEN", "教师工作空间只能创建学习小组");
    }
    if (organization.type !== "TEACHER_WORKSPACE" && input.type === "LEARNING_GROUP") {
      throw new DomainError("FORBIDDEN", "学习小组只能在教师工作空间创建");
    }
    requireName(input.name, "分组名称");
    requireRequestId(input.requestId);
    const now = this.dependencies.clock.now();
    const group: Group = {
      id: this.dependencies.ids.next("group"),
      coGrowingEnabled: false,
      createdAt: now,
      name: input.name.trim(),
      organizationId: input.organizationId,
      status: "ACTIVE",
      type: input.type,
      updatedAt: now,
    };

    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("groups", group);
      await this.audit(tx, {
        action: "GROUP_CREATED",
        actorAccountId: actor.accountId,
        requestId: input.requestId,
        resourceId: group.id,
        resourceType: "GROUP",
        tenantScope: { kind: "ORGANIZATION", organizationId: input.organizationId },
      });
      return group;
    });
  }

  async bindGroupRole(
    actor: ActorContext,
    input: RequestBase & {
      readonly accountId: string;
      readonly groupId: string;
      readonly role: GroupRoleBinding["role"];
    },
  ): Promise<GroupRoleBinding> {
    const group = await this.requireGroup(input.groupId);
    await this.policy.requireOrganizationRole(actor, group.organizationId, ["ORGANIZATION_ADMIN"]);
    const target = await this.dependencies.repository.read("accounts", input.accountId);
    if (target?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "成员账号不存在");
    }
    requireRequestId(input.requestId);
    const now = this.dependencies.clock.now();

    return this.dependencies.repository.transaction(async (tx) => {
      const organizationMembership = (
        await tx.query("organizationMembers", {
          accountId: input.accountId,
          organizationId: group.organizationId,
        })
      )[0];
      if (organizationMembership === undefined) {
        await tx.insert("organizationMembers", {
          id: this.dependencies.ids.next("organization_member"),
          accountId: input.accountId,
          createdAt: now,
          displayName: input.accountId,
          memberType: "ADULT",
          organizationId: group.organizationId,
          organizationMemberId: this.dependencies.ids.next("organization_person"),
          organizationRole: "STAFF",
          status: "ACTIVE",
          updatedAt: now,
        });
      }
      const binding: GroupRoleBinding = {
        id: this.dependencies.ids.next("group_role"),
        accountId: input.accountId,
        createdAt: now,
        groupId: group.id,
        organizationId: group.organizationId,
        role: input.role,
        status: "ACTIVE",
        updatedAt: now,
      };
      await tx.insert("groupRoleBindings", binding);
      await this.audit(tx, {
        action: "GROUP_ROLE_BOUND",
        actorAccountId: actor.accountId,
        requestId: input.requestId,
        resourceId: binding.id,
        resourceType: "GROUP_ROLE_BINDING",
        tenantScope: { kind: "ORGANIZATION", organizationId: group.organizationId },
      });
      return binding;
    });
  }

  async getOrganizationChild(
    actor: ActorContext,
    organizationMemberId: string,
  ): Promise<OrganizationChildView> {
    const { member } = await this.policy.requireOrganizationChild(actor, organizationMemberId);
    return {
      displayName: member.displayName,
      grade: member.grade,
      organizationMemberId: member.organizationMemberId,
    };
  }

  private async requireActiveAccount(actor: ActorContext): Promise<Account> {
    if (actor.mode !== "ACCOUNT" && actor.mode !== "CHILD") {
      throw new DomainError("FORBIDDEN", "当前身份不是普通账号");
    }
    const account = await this.dependencies.repository.read("accounts", actor.accountId);
    if (account?.status !== "ACTIVE") {
      throw new DomainError("UNAUTHORIZED", "账号不存在或已停用");
    }
    return account;
  }

  private async requireGroup(groupId: string): Promise<Group> {
    const group = await this.dependencies.repository.read("groups", groupId);
    if (group?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "分组不存在或已停用");
    }
    return group;
  }

  private async audit(
    tx: Transaction,
    input: {
      readonly action: string;
      readonly actorAccountId: string;
      readonly requestId: string;
      readonly resourceId: string;
      readonly resourceType: string;
      readonly tenantScope: TenantScope;
    },
  ): Promise<void> {
    await tx.appendAudit({
      id: this.dependencies.ids.next("audit"),
      action: input.action,
      actorAccountId: input.actorAccountId,
      createdAt: this.dependencies.clock.now(),
      metadata: {},
      requestId: input.requestId,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      tenantScope: input.tenantScope,
    });
  }
}

function requireName(value: string, label: string): void {
  const length = value.trim().length;
  if (length < 1 || length > 40) {
    throw new DomainError("INVALID_INPUT", `${label}长度必须是 1 至 40 个字符`);
  }
}

function requireText(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new DomainError("INVALID_INPUT", `${label}不能为空`);
  }
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
