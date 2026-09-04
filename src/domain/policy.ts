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
    const bindings = await this.repository.query("groupRoleBindings", {
      accountId: actor.accountId,
      groupId,
      status: "ACTIVE",
    });
    const binding = bindings.find((candidate) => roles.includes(candidate.role));
    if (binding === undefined) {
      throw new DomainError("FORBIDDEN", "当前账号没有分组权限");
    }
    return binding;
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
    const memberships = await this.repository.query("childGroupMemberships", {
      organizationId: member.organizationId,
      organizationMemberId,
      status: "ACTIVE",
    });
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
