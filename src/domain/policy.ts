import type {
  ActorContext,
  ChildGroupMembership,
  FamilyMember,
  GroupRoleBinding,
  GuardianLink,
  OrganizationMember,
  TenantScope,
} from "./model.js";
import type { ReadRepository } from "../application/ports.js";
import { DomainError } from "../shared/errors.js";

export class AccessPolicy {
  constructor(private readonly repository: ReadRepository) {}

  async requireGuardian(actor: ActorContext, childId: string): Promise<GuardianLink> {
    if (actor.mode !== "ACCOUNT") {
      throw new DomainError("FORBIDDEN", "监护操作必须使用成人账号");
    }
    const links = await this.repository.query("guardianLinks", {
      accountId: actor.accountId,
      childId,
      status: "ACTIVE",
    });
    const link = links[0];
    if (link === undefined) {
      throw new DomainError("FORBIDDEN", "当前账号不是该孩子的有效监护人");
    }
    return link;
  }

  /** Child selection is request data, never an authenticated actor identity. */
  async requireChildScope(actor: ActorContext, childId: unknown): Promise<GuardianLink> {
    if (actor.mode !== "ACCOUNT") {
      throw new DomainError("FORBIDDEN", "孩子操作必须使用成人账号");
    }
    if (typeof childId !== "string" || childId.trim().length === 0) {
      throw new DomainError("INVALID_INPUT", "必须明确选择孩子");
    }
    const guardian = await this.requireGuardian(actor, childId);
    const account = await this.repository.read("accounts", actor.accountId);
    if (account?.status !== "ACTIVE") throw new DomainError("UNAUTHORIZED", "账号已停用");
    const child = await this.repository.read("children", guardian.childId);
    if (child?.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "孩子档案已停用");
    return guardian;
  }

  async requireFamilyRole(
    actor: ActorContext,
    familyId: string,
    roles: readonly FamilyMember["role"][] = ["FAMILY_ADMIN", "GUARDIAN"],
  ): Promise<FamilyMember> {
    const members = await this.repository.query("familyMembers", {
      accountId: actor.accountId,
      familyId,
      status: "ACTIVE",
    });
    const member = members.find((candidate) => roles.includes(candidate.role));
    if (member === undefined) {
      throw new DomainError("FORBIDDEN", "当前账号没有家庭权限");
    }
    return member;
  }

  async requireOrganizationRole(
    actor: ActorContext,
    organizationId: string,
    roles: readonly NonNullable<OrganizationMember["organizationRole"]>[] = [
      "ORGANIZATION_ADMIN",
      "STAFF",
    ],
  ): Promise<OrganizationMember> {
    if (actor.mode !== "ACCOUNT") throw new DomainError("FORBIDDEN", "请使用成人机构身份");
    const organization = await this.repository.read("organizations", organizationId);
    if (organization?.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "机构已停用");
    const members = await this.repository.query("organizationMembers", {
      accountId: actor.accountId,
      organizationId,
      status: "ACTIVE",
    });
    const member = members.find(
      (candidate) =>
        candidate.memberType === "ADULT" &&
        candidate.organizationRole !== undefined &&
        roles.includes(candidate.organizationRole),
    );
    if (member === undefined) {
      throw new DomainError("FORBIDDEN", "当前账号没有机构权限");
    }
    return member;
  }

  async requireGroupRole(
    actor: ActorContext,
    groupId: string,
    roles: readonly GroupRoleBinding["role"][] = ["TEACHER", "ASSISTANT"],
  ): Promise<GroupRoleBinding> {
    if (actor.mode !== "ACCOUNT") throw new DomainError("FORBIDDEN", "请使用成人机构身份");
    const group = await this.repository.read("groups", groupId);
    const organization =
      group && (await this.repository.read("organizations", group.organizationId));
    if (group?.status !== "ACTIVE" || organization?.status !== "ACTIVE")
      throw new DomainError("FORBIDDEN", "分组或机构授权已失效");
    await this.requireOrganizationRole(actor, organization.id);
    const bindings = await this.repository.query("groupRoleBindings", {
      accountId: actor.accountId,
      groupId,
      status: "ACTIVE",
    });
    const binding = bindings.find(
      (candidate) => roles.includes(candidate.role) && candidate.organizationId === organization.id,
    );
    if (binding === undefined) {
      throw new DomainError("FORBIDDEN", "当前账号没有分组权限");
    }
    return binding;
  }

  async requireGroupAccess(
    actor: ActorContext,
    groupId: string,
  ): Promise<{ organizationId: string }> {
    if (actor.mode !== "ACCOUNT") throw new DomainError("FORBIDDEN", "请使用成人机构身份");
    const group = await this.repository.read("groups", groupId);
    const organization =
      group && (await this.repository.read("organizations", group.organizationId));
    if (group?.status !== "ACTIVE" || organization?.status !== "ACTIVE") {
      throw new DomainError("FORBIDDEN", "分组或机构授权已失效");
    }
    const member = await this.requireOrganizationRole(actor, organization.id);
    if (member.organizationRole !== "ORGANIZATION_ADMIN") {
      const binding = await this.requireGroupRole(actor, group.id);
      if (binding.organizationId !== organization.id)
        throw new DomainError("FORBIDDEN", "分组授权已失效");
    }
    return { organizationId: organization.id };
  }

  async requireOrganizationChild(
    actor: ActorContext,
    organizationMemberId: string,
  ): Promise<{ member: OrganizationMember; memberships: ChildGroupMembership[] }> {
    const members = await this.repository.query(
      "organizationMembers",
      (candidate) =>
        candidate.organizationMemberId === organizationMemberId &&
        candidate.memberType === "CHILD" &&
        candidate.status === "ACTIVE",
    );
    const member = members[0];
    if (member === undefined) {
      throw new DomainError("NOT_FOUND", "机构成员不存在");
    }
    await this.requireOrganizationRole(actor, member.organizationId);
    const candidates = await this.repository.query("childGroupMemberships", {
      organizationId: member.organizationId,
      organizationMemberId,
      status: "ACTIVE",
    });
    const memberships: ChildGroupMembership[] = [];
    for (const membership of candidates) {
      try {
        await this.requireGroupAccess(actor, membership.groupId);
        memberships.push(membership);
      } catch (error) {
        if (!(error instanceof DomainError) || !["FORBIDDEN", "NOT_FOUND"].includes(error.code))
          throw error;
      }
    }
    if (!memberships.length) throw new DomainError("FORBIDDEN", "没有当前可查看的孩子分组授权");
    return { member, memberships };
  }

  async canReadChildScope(
    actor: ActorContext,
    childId: string,
    scope: TenantScope,
  ): Promise<boolean> {
    try {
      if (scope.kind === "FAMILY") {
        const guardian = await this.requireGuardian(actor, childId);
        return guardian.familyId === scope.familyId;
      }
      if (scope.kind === "ORGANIZATION") {
        await this.requireOrganizationRole(actor, scope.organizationId);
        const memberships = await this.repository.query("childGroupMemberships", {
          childId,
          organizationId: scope.organizationId,
          status: "ACTIVE",
        });
        return memberships.length > 0;
      }
      return actor.mode === "PLATFORM";
    } catch (error) {
      if (
        error instanceof DomainError &&
        (error.code === "FORBIDDEN" || error.code === "NOT_FOUND")
      ) {
        return false;
      }
      throw error;
    }
  }
}
