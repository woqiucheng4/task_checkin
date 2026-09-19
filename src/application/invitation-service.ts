import { createHash } from "node:crypto";

import type { ApplicationDependencies, ReadRepository, Transaction } from "./ports.js";
import type {
  ActorContext,
  ChildGroupMembership,
  DisclosureScope,
  Group,
  Invitation,
  JoinRequest,
  RosterSeat,
  TenantScope,
} from "../domain/model.js";
import { AccessPolicy } from "../domain/policy.js";
import { DomainError } from "../shared/errors.js";

interface RequestBase {
  readonly requestId: string;
}

export type CreatedInvitation = Invitation & { readonly code: string };
export type CreatedRosterSeat = RosterSeat & { readonly claimCode: string };

export class InvitationService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async createGroupInvitation(
    actor: ActorContext,
    input: RequestBase & {
      readonly groupId: string;
      readonly expiresAt: string;
      readonly maxClaims: number;
    },
  ): Promise<CreatedInvitation> {
    const group = await this.requireManagedGroup(actor, input.groupId);
    requireRequestId(input.requestId);
    if (Date.parse(input.expiresAt) <= Date.parse(this.dependencies.clock.now())) {
      throw new DomainError("INVALID_INPUT", "邀请码有效期必须晚于当前时间");
    }
    if (!Number.isInteger(input.maxClaims) || input.maxClaims < 1 || input.maxClaims > 500) {
      throw new DomainError("INVALID_INPUT", "邀请码可使用次数必须是 1 至 500");
    }
    const code = this.dependencies.ids.next("invite");
    const now = this.dependencies.clock.now();
    const invitation: Invitation = {
      id: this.dependencies.ids.next("invitation"),
      claimCount: 0,
      codeHash: hashCode(code),
      createdAt: now,
      createdByAccountId: actor.accountId,
      expiresAt: input.expiresAt,
      groupId: group.id,
      maxClaims: input.maxClaims,
      organizationId: group.organizationId,
      purpose: "GROUP_JOIN",
      status: "ACTIVE",
      updatedAt: now,
    };

    await this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("invitations", invitation);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "INVITATION_CREATED",
        groupScope(group),
        invitation.id,
      );
    });
    return { ...invitation, code };
  }

  async claimInvitation(
    actor: ActorContext,
    input: RequestBase & {
      readonly childId: string;
      readonly code: string;
      readonly disclosure: DisclosureScope;
    },
  ): Promise<JoinRequest> {
    requireRequestId(input.requestId);
    if (actor.mode !== "ACCOUNT")
      throw new DomainError("FORBIDDEN", "只有成人监护人可以提交授权申请");
    return this.dependencies.repository.transaction(async (tx) => {
      const guardian = await new AccessPolicy(tx).requireGuardian(actor, input.childId);
      const invitation = (await tx.query("invitations", { codeHash: hashCode(input.code) }))[0];
      if (invitation === undefined) {
        throw new DomainError("NOT_FOUND", "邀请码不存在");
      }
      const previous = (
        await tx.query("joinRequests", {
          childId: input.childId,
          invitationId: invitation.id,
          guardianAccountId: actor.accountId,
        })
      ).find((request) => request.status !== "REJECTED");
      // A consumed invitation can still return this guardian's own original claim.
      // Never return another guardian's consent or join request.
      if (previous !== undefined) return previous;
      this.assertInvitationUsable(invitation);
      const group = await tx.read("groups", invitation.groupId);
      const organization = await tx.read("organizations", invitation.organizationId);
      const child = await tx.read("children", input.childId);
      if (
        group?.status !== "ACTIVE" ||
        organization?.status !== "ACTIVE" ||
        group.organizationId !== invitation.organizationId ||
        child?.status !== "ACTIVE"
      )
        throw new DomainError("FORBIDDEN", "孩子或分组已停用");
      await this.assertNoOpenMembership(input.childId, invitation.groupId, tx);
      const now = this.dependencies.clock.now();
      const joinRequest: JoinRequest = {
        id: this.dependencies.ids.next("join_request"),
        childId: input.childId,
        createdAt: now,
        disclosure: structuredClone(input.disclosure),
        groupId: invitation.groupId,
        guardianAccountId: actor.accountId,
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
        status: "PENDING_APPROVAL",
        updatedAt: now,
      };

      await tx.insert("consentRecords", {
        id: this.dependencies.ids.next("consent"),
        action: "GRANTED",
        childId: input.childId,
        createdAt: now,
        disclosure: structuredClone(input.disclosure),
        groupId: invitation.groupId,
        guardianAccountId: actor.accountId,
        organizationId: invitation.organizationId,
        requestId: input.requestId,
      });
      await tx.insert("joinRequests", joinRequest);
      const nextClaimCount = invitation.claimCount + 1;
      await tx.update("invitations", invitation.id, {
        claimCount: nextClaimCount,
        status: nextClaimCount >= invitation.maxClaims ? "CONSUMED" : "ACTIVE",
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "GROUP_JOIN_CLAIMED",
        { kind: "FAMILY", familyId: guardian.familyId },
        joinRequest.id,
      );
      return joinRequest;
    });
  }

  async preview(actor: ActorContext, code: string, childId: string) {
    if (actor.mode !== "ACCOUNT") throw new DomainError("FORBIDDEN", "请家长查看和确认邀请");
    if (typeof code !== "string" || code.length < 1 || code.length > 200)
      throw new DomainError("INVALID_INPUT", "邀请码格式无效");
    await this.policy.requireGuardian(actor, childId);
    const invitation = (
      await this.dependencies.repository.query("invitations", { codeHash: hashCode(code.trim()) })
    )[0];
    if (!invitation) throw new DomainError("NOT_FOUND", "邀请码不存在");
    this.assertInvitationUsable(invitation);
    const group = await this.dependencies.repository.read("groups", invitation.groupId);
    const organization = await this.dependencies.repository.read(
      "organizations",
      invitation.organizationId,
    );
    if (group?.status !== "ACTIVE" || organization?.status !== "ACTIVE")
      throw new DomainError("NOT_FOUND", "分组已停用");
    return {
      groupName: group.name,
      organizationName: organization.name,
      type: organization.type,
      expiresAt: invitation.expiresAt,
    };
  }

  async approveJoinRequest(
    actor: ActorContext,
    input: RequestBase & { readonly joinRequestId: string },
  ): Promise<ChildGroupMembership> {
    requireRequestId(input.requestId);
    return this.dependencies.repository.transaction(async (tx) => {
      const joinRequest = await this.requirePendingJoin(input.joinRequestId, tx);
      const group = await this.requireManagedGroup(actor, joinRequest.groupId, tx);
      await new AccessPolicy(tx).requireGuardian(
        { accountId: joinRequest.guardianAccountId, mode: "ACCOUNT" },
        joinRequest.childId,
      );
      await this.requireApprovalSource(tx, joinRequest);
      const activeMemberships = await tx.query("childGroupMemberships", {
        childId: joinRequest.childId,
        groupId: group.id,
        status: "ACTIVE",
      });
      if (activeMemberships.length > 0) throw new DomainError("ALREADY_EXISTS", "孩子已加入该分组");
      const child = await tx.read("children", joinRequest.childId);
      if (child?.status !== "ACTIVE") {
        throw new DomainError("NOT_FOUND", "孩子账号不存在或已停用");
      }
      const now = this.dependencies.clock.now();

      let organizationMember = (
        await tx.query("organizationMembers", {
          childId: child.id,
          organizationId: group.organizationId,
        })
      )[0];
      if (organizationMember === undefined) {
        const memberId = this.dependencies.ids.next("organization_child");
        organizationMember = await tx.insert("organizationMembers", {
          id: this.dependencies.ids.next("organization_member"),
          childId: child.id,
          createdAt: now,
          displayName: joinRequest.disclosure.displayName ? child.nickname : memberId,
          ...(joinRequest.disclosure.grade && child.grade !== undefined
            ? { grade: child.grade }
            : {}),
          memberType: "CHILD",
          organizationId: group.organizationId,
          organizationMemberId: memberId,
          status: "ACTIVE",
          updatedAt: now,
        });
      } else if (organizationMember.status !== "ACTIVE") {
        organizationMember = await tx.update("organizationMembers", organizationMember.id, {
          status: "ACTIVE",
          updatedAt: now,
        });
      }

      const membership: ChildGroupMembership = {
        id: this.dependencies.ids.next("child_group"),
        childId: child.id,
        createdAt: now,
        disclosure: structuredClone(joinRequest.disclosure),
        groupId: group.id,
        organizationId: group.organizationId,
        organizationMemberId: organizationMember.organizationMemberId,
        status: "ACTIVE",
        updatedAt: now,
      };
      await tx.insert("childGroupMemberships", membership);
      await tx.update("joinRequests", joinRequest.id, {
        reviewedByAccountId: actor.accountId,
        status: "APPROVED",
        updatedAt: now,
      });
      if (joinRequest.invitationId.startsWith("roster:")) {
        const rosterSeatId = joinRequest.invitationId.slice("roster:".length);
        await tx.update("rosterSeats", rosterSeatId, {
          childGroupMembershipId: membership.id,
          status: "CLAIMED",
          updatedAt: now,
        });
      }
      await this.audit(
        tx,
        actor,
        input.requestId,
        "GROUP_JOIN_APPROVED",
        groupScope(group),
        membership.id,
      );
      return membership;
    });
  }

  async rejectJoinRequest(
    actor: ActorContext,
    input: RequestBase & { readonly joinRequestId: string },
  ): Promise<JoinRequest> {
    requireRequestId(input.requestId);
    return this.dependencies.repository.transaction(async (tx) => {
      const joinRequest = await this.requirePendingJoin(input.joinRequestId, tx);
      const group = await this.requireManagedGroup(actor, joinRequest.groupId, tx);
      const now = this.dependencies.clock.now();
      const rejected = await tx.update("joinRequests", joinRequest.id, {
        reviewedByAccountId: actor.accountId,
        status: "REJECTED",
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "GROUP_JOIN_REJECTED",
        groupScope(group),
        joinRequest.id,
      );
      return rejected;
    });
  }

  async createRosterSeat(
    actor: ActorContext,
    input: RequestBase & { readonly groupId: string; readonly rosterNumber: string },
  ): Promise<CreatedRosterSeat> {
    const group = await this.requireManagedGroup(actor, input.groupId);
    requireRequestId(input.requestId);
    if (input.rosterNumber.trim().length < 1 || input.rosterNumber.trim().length > 40) {
      throw new DomainError("INVALID_INPUT", "机构内部编号长度必须是 1 至 40 个字符");
    }
    const duplicate = await this.dependencies.repository.query("rosterSeats", {
      groupId: group.id,
      rosterNumber: input.rosterNumber.trim(),
    });
    if (duplicate.length > 0) {
      throw new DomainError("ALREADY_EXISTS", "该机构内部编号已存在");
    }
    const claimCode = this.dependencies.ids.next("roster_claim");
    const now = this.dependencies.clock.now();
    const seat: RosterSeat = {
      id: this.dependencies.ids.next("roster_seat"),
      claimCodeHash: hashCode(claimCode),
      createdAt: now,
      groupId: group.id,
      organizationId: group.organizationId,
      rosterNumber: input.rosterNumber.trim(),
      status: "UNCLAIMED",
      updatedAt: now,
    };
    await this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("rosterSeats", seat);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "ROSTER_SEAT_CREATED",
        groupScope(group),
        seat.id,
      );
    });
    return { ...seat, claimCode };
  }

  async claimRosterSeat(
    actor: ActorContext,
    input: RequestBase & {
      readonly childId: string;
      readonly claimCode: string;
      readonly disclosure: DisclosureScope;
    },
  ): Promise<JoinRequest> {
    requireRequestId(input.requestId);
    const guardian = await this.policy.requireGuardian(actor, input.childId);
    const seat = (
      await this.dependencies.repository.query("rosterSeats", {
        claimCodeHash: hashCode(input.claimCode),
      })
    )[0];
    if (seat === undefined || seat.status !== "UNCLAIMED") {
      throw new DomainError("NOT_FOUND", "认领码不存在或已使用");
    }
    await this.assertNoOpenMembership(input.childId, seat.groupId);
    const now = this.dependencies.clock.now();
    const joinRequest: JoinRequest = {
      id: this.dependencies.ids.next("join_request"),
      childId: input.childId,
      createdAt: now,
      disclosure: structuredClone(input.disclosure),
      groupId: seat.groupId,
      guardianAccountId: actor.accountId,
      invitationId: `roster:${seat.id}`,
      organizationId: seat.organizationId,
      status: "PENDING_APPROVAL",
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("consentRecords", {
        id: this.dependencies.ids.next("consent"),
        action: "GRANTED",
        childId: input.childId,
        createdAt: now,
        disclosure: structuredClone(input.disclosure),
        groupId: seat.groupId,
        guardianAccountId: actor.accountId,
        organizationId: seat.organizationId,
        requestId: input.requestId,
      });
      await tx.insert("joinRequests", joinRequest);
      await tx.update("rosterSeats", seat.id, { status: "CLAIMED", updatedAt: now });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "ROSTER_SEAT_CLAIMED",
        { kind: "FAMILY", familyId: guardian.familyId },
        seat.id,
      );
      return joinRequest;
    });
  }

  async withdrawChild(
    actor: ActorContext,
    input: RequestBase & { readonly childGroupMembershipId: string },
  ): Promise<ChildGroupMembership> {
    requireRequestId(input.requestId);
    const membership = await this.dependencies.repository.read(
      "childGroupMemberships",
      input.childGroupMembershipId,
    );
    if (membership?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "有效分组关系不存在");
    }
    const guardian = await this.policy.requireGuardian(actor, membership.childId);
    const now = this.dependencies.clock.now();

    return this.dependencies.repository.transaction(async (tx) => {
      const withdrawn = await tx.update("childGroupMemberships", membership.id, {
        status: "WITHDRAWN",
        updatedAt: now,
        withdrawnAt: now,
      });
      const otherMemberships = await tx.query(
        "childGroupMemberships",
        (candidate) =>
          candidate.id !== membership.id &&
          candidate.organizationMemberId === membership.organizationMemberId &&
          candidate.status === "ACTIVE",
      );
      if (otherMemberships.length === 0) {
        const organizationMember = (
          await tx.query("organizationMembers", {
            organizationMemberId: membership.organizationMemberId,
          })
        )[0];
        if (organizationMember !== undefined) {
          await tx.update("organizationMembers", organizationMember.id, {
            displayName: `已退出成员-${organizationMember.organizationMemberId.slice(-6)}`,
            status: "WITHDRAWN",
            updatedAt: now,
          });
        }
      }
      await tx.insert("consentRecords", {
        id: this.dependencies.ids.next("consent"),
        action: "REVOKED",
        childId: membership.childId,
        createdAt: now,
        disclosure: structuredClone(membership.disclosure),
        groupId: membership.groupId,
        guardianAccountId: actor.accountId,
        organizationId: membership.organizationId,
        requestId: input.requestId,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "GROUP_MEMBERSHIP_WITHDRAWN",
        { kind: "FAMILY", familyId: guardian.familyId },
        membership.id,
      );
      return withdrawn;
    });
  }

  private async requireManagedGroup(
    actor: ActorContext,
    groupId: string,
    repository: ReadRepository = this.dependencies.repository,
  ): Promise<Group> {
    if (actor.mode !== "ACCOUNT") throw new DomainError("FORBIDDEN", "请使用教师账号");
    const group = await repository.read("groups", groupId);
    if (group?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "分组不存在或已停用");
    }
    const organization = await repository.read("organizations", group.organizationId);
    if (organization?.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "机构已停用");
    const policy = new AccessPolicy(repository);
    try {
      await policy.requireOrganizationRole(actor, group.organizationId, ["ORGANIZATION_ADMIN"]);
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "FORBIDDEN") {
        throw error;
      }
      await policy.requireOrganizationRole(actor, group.organizationId);
      const binding = await policy.requireGroupRole(actor, group.id);
      if (binding.organizationId !== group.organizationId)
        throw new DomainError("FORBIDDEN", "分组绑定不属于该机构");
    }
    return group;
  }

  private assertInvitationUsable(invitation: Invitation): void {
    if (
      invitation.status !== "ACTIVE" ||
      invitation.claimCount >= invitation.maxClaims ||
      Date.parse(invitation.expiresAt) <= Date.parse(this.dependencies.clock.now())
    ) {
      throw new DomainError("INVITATION_EXPIRED", "邀请码已过期或已使用完");
    }
  }

  private async assertNoOpenMembership(
    childId: string,
    groupId: string,
    repository: ReadRepository = this.dependencies.repository,
  ): Promise<void> {
    const memberships = await repository.query("childGroupMemberships", {
      childId,
      groupId,
      status: "ACTIVE",
    });
    const pending = await repository.query("joinRequests", {
      childId,
      groupId,
      status: "PENDING_APPROVAL",
    });
    if (memberships.length > 0 || pending.length > 0) {
      throw new DomainError("ALREADY_EXISTS", "孩子已加入或正在申请该分组");
    }
  }

  private async requireApprovalSource(tx: Transaction, request: JoinRequest): Promise<void> {
    if (request.invitationId.startsWith("roster:")) {
      const seat = await tx.read("rosterSeats", request.invitationId.slice("roster:".length));
      if (
        seat?.status !== "CLAIMED" ||
        seat.childGroupMembershipId !== undefined ||
        seat.groupId !== request.groupId ||
        seat.organizationId !== request.organizationId
      )
        throw new DomainError("FORBIDDEN", "名册认领已失效");
      return;
    }
    const invitation = await tx.read("invitations", request.invitationId);
    if (
      invitation === undefined ||
      !["ACTIVE", "CONSUMED"].includes(invitation.status) ||
      Date.parse(invitation.expiresAt) <= Date.parse(this.dependencies.clock.now()) ||
      invitation.groupId !== request.groupId ||
      invitation.organizationId !== request.organizationId
    )
      throw new DomainError("INVITATION_EXPIRED", "加入邀请已失效");
  }

  private async requirePendingJoin(
    joinRequestId: string,
    repository: ReadRepository = this.dependencies.repository,
  ): Promise<JoinRequest> {
    const request = await repository.read("joinRequests", joinRequestId);
    if (request?.status !== "PENDING_APPROVAL") {
      throw new DomainError("NOT_FOUND", "待审核加入申请不存在");
    }
    return request;
  }

  private async audit(
    tx: Transaction,
    actor: ActorContext,
    requestId: string,
    action: string,
    tenantScope: TenantScope,
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
      tenantScope,
    });
  }
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}

function groupScope(group: Group): TenantScope {
  return { kind: "ORGANIZATION", organizationId: group.organizationId };
}
