import { describe, expect, it } from "vitest";

import { IdentityService } from "../../src/application/identity-service.js";
import { InvitationService } from "../../src/application/invitation-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createHarness } from "../helpers/harness.js";

const platform: ActorContext = { accountId: "platform", mode: "PLATFORM" };

describe("group withdrawal", () => {
  it("stops future membership while preserving personal sunlight and trees", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    const invitations = new InvitationService(harness);
    const guardianAccount = await identity.createAccount({
      openId: "wx-g",
      requestId: "account-g",
    });
    const teacherAccount = await identity.createAccount({ openId: "wx-t", requestId: "account-t" });
    const guardian: ActorContext = { accountId: guardianAccount.id, mode: "ACCOUNT" };
    const teacher: ActorContext = { accountId: teacherAccount.id, mode: "ACCOUNT" };
    const family = await identity.createFamily(guardian, { name: "星星家", requestId: "family-g" });
    const child = await identity.addChild(guardian, {
      familyId: family.id,
      nickname: "乐乐",
      requestId: "child-g-1",
    });
    const organization = await identity.createOrganization(platform, {
      adminAccountId: teacher.accountId,
      name: "青禾学校",
      requestId: "organization-t",
      type: "SCHOOL",
    });
    const group = await identity.createGroup(teacher, {
      name: "二年级一班",
      organizationId: organization.id,
      requestId: "group-t-1",
      type: "SCHOOL_CLASS",
    });
    const invitation = await invitations.createGroupInvitation(teacher, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      groupId: group.id,
      maxClaims: 1,
      requestId: "invite-withdraw",
    });
    const join = await invitations.claimInvitation(guardian, {
      childId: child.id,
      code: invitation.code,
      disclosure: { avatar: false, displayName: true, grade: false },
      requestId: "claim-withdraw",
    });
    const membership = await invitations.approveJoinRequest(teacher, {
      joinRequestId: join.id,
      requestId: "approve-withdraw",
    });
    await harness.repository.transaction(async (tx) => {
      await tx.insert("sunlightLedgers", {
        id: "sunlight-personal",
        actorAccountId: guardian.accountId,
        amount: 6,
        childId: child.id,
        createdAt: harness.clock.now(),
        reason: "TASK_COMPLETED",
        referenceId: "assignment-personal",
        requestId: "sunlight-personal",
      });
      await tx.insert("childTrees", {
        id: "tree-personal",
        carryOver: 0,
        catalogId: "starter-apple",
        childId: child.id,
        createdAt: harness.clock.now(),
        progress: 6,
        stage: "成熟采摘",
        status: "MATURE",
        updatedAt: harness.clock.now(),
      });
    });

    await invitations.withdrawChild(guardian, {
      childGroupMembershipId: membership.id,
      requestId: "withdraw-1",
    });

    expect(await harness.repository.read("childGroupMemberships", membership.id)).toMatchObject({
      status: "WITHDRAWN",
    });
    expect(await harness.repository.read("sunlightLedgers", "sunlight-personal")).toMatchObject({
      amount: 6,
    });
    expect(await harness.repository.read("childTrees", "tree-personal")).toMatchObject({
      progress: 6,
      status: "MATURE",
    });
    expect(
      await harness.repository.query("consentRecords", {
        action: "REVOKED",
        childId: child.id,
      }),
    ).toHaveLength(1);
  });
});
