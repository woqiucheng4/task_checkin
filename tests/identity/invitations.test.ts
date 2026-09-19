import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdentityService } from "../../src/application/identity-service.js";
import { InvitationService } from "../../src/application/invitation-service.js";
import { TeacherActivationService } from "../../src/application/teacher-activation-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createHarness } from "../helpers/harness.js";

const platform: ActorContext = { accountId: "platform-operator", mode: "PLATFORM" };
const teacherActivationPepper = "invitation-test-teacher-activation-pepper";

async function invitationScenario(now = "2026-09-05T10:00:00.000Z") {
  const harness = createHarness({}, now);
  const identity = new IdentityService(harness);
  const invitations = new InvitationService(harness);
  const activations = new TeacherActivationService(harness);
  const guardianAccount = await identity.createAccount({
    openId: "wx-guardian",
    requestId: "account-guardian",
  });
  const teacherAccount = await identity.createAccount({
    openId: "wx-teacher",
    requestId: "account-teacher",
  });
  const guardian: ActorContext = { accountId: guardianAccount.id, mode: "ACCOUNT" };
  const teacher: ActorContext = { accountId: teacherAccount.id, mode: "ACCOUNT" };
  const family = await identity.createFamily(guardian, {
    name: "晨光家",
    requestId: "family-guardian",
  });
  const child = await identity.addChild(guardian, {
    familyId: family.id,
    grade: 3,
    nickname: "果果",
    requestId: "child-guardian",
  });
  const activation = await activations.issue(platform, {
    expiresAt: "2026-09-06T10:00:00.000Z",
    requestId: "activation-issue-teacher",
  });
  const organization = await identity.activateTeacherWorkspace(teacher, {
    code: activation.code,
    requestId: "activation-redeem-teacher",
    workspaceName: "青禾老师",
  });
  const group = await identity.createGroup(teacher, {
    name: "三年级学习小组",
    organizationId: organization.id,
    requestId: "group-teacher",
    type: "LEARNING_GROUP",
  });
  return { child, family, group, guardian, harness, invitations, organization, teacher };
}

describe("group invitation lifecycle", () => {
  beforeEach(() => vi.stubEnv("TEACHER_ACTIVATION_PEPPER", teacherActivationPepper));
  afterEach(() => vi.unstubAllEnvs());
  it("previews the real destination without granting consent or consuming an invitation", async () => {
    const seed = await invitationScenario();
    const created = await seed.invitations.createGroupInvitation(seed.teacher, {
      groupId: seed.group.id,
      expiresAt: "2026-09-06T10:00:00.000Z",
      maxClaims: 10,
      requestId: "preview-invitation-0001",
    });
    const result = await seed.invitations.preview(seed.guardian, created.code, seed.child.id);
    expect(result).toMatchObject({
      groupName: "三年级学习小组",
      organizationName: "青禾老师",
      type: "TEACHER_WORKSPACE",
    });
    expect(result).not.toHaveProperty("codeHash");
    expect(await seed.harness.repository.query("consentRecords")).toHaveLength(0);
    expect(await seed.harness.repository.read("invitations", created.id)).toMatchObject({
      claimCount: 0,
    });
  });
  it("does not let child mode grant guardian consent", async () => {
    const seed = await invitationScenario();
    const created = await seed.invitations.createGroupInvitation(seed.teacher, {
      groupId: seed.group.id,
      expiresAt: "2026-09-06T10:00:00.000Z",
      maxClaims: 10,
      requestId: "consent-invitation-0001",
    });
    await expect(
      seed.invitations.preview(
        { ...seed.guardian, mode: "CHILD", childId: seed.child.id },
        created.code,
        seed.child.id,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      seed.invitations.claimInvitation(
        { ...seed.guardian, mode: "CHILD", childId: seed.child.id },
        {
          childId: seed.child.id,
          code: created.code,
          disclosure: { avatar: false, displayName: true, grade: true },
          requestId: "child-consent-denied-0001",
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await seed.harness.repository.query("consentRecords")).toHaveLength(0);
  });
  it("records guardian consent but creates no membership before approval", async () => {
    const seed = await invitationScenario();
    const created = await seed.invitations.createGroupInvitation(seed.teacher, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      groupId: seed.group.id,
      maxClaims: 10,
      requestId: "invite-create-1",
    });

    const join = await seed.invitations.claimInvitation(seed.guardian, {
      childId: seed.child.id,
      code: created.code,
      disclosure: { avatar: false, displayName: true, grade: true },
      requestId: "invite-claim-1",
    });

    expect(join.status).toBe("PENDING_APPROVAL");
    expect(
      await seed.harness.repository.query("childGroupMemberships", { childId: seed.child.id }),
    ).toHaveLength(0);
    expect(
      await seed.harness.repository.query("consentRecords", {
        action: "GRANTED",
        childId: seed.child.id,
      }),
    ).toHaveLength(1);
  });

  it("creates organization-scoped membership only after an authorized approval", async () => {
    const seed = await invitationScenario();
    const created = await seed.invitations.createGroupInvitation(seed.teacher, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      groupId: seed.group.id,
      maxClaims: 10,
      requestId: "invite-create-2",
    });
    const join = await seed.invitations.claimInvitation(seed.guardian, {
      childId: seed.child.id,
      code: created.code,
      disclosure: { avatar: false, displayName: true, grade: true },
      requestId: "invite-claim-2",
    });

    const membership = await seed.invitations.approveJoinRequest(seed.teacher, {
      joinRequestId: join.id,
      requestId: "invite-approve-2",
    });

    expect(membership).toMatchObject({
      childId: seed.child.id,
      groupId: seed.group.id,
      organizationId: seed.organization.id,
      status: "ACTIVE",
    });
    expect(membership.organizationMemberId).not.toBe(seed.child.id);
    expect(
      await seed.harness.repository.query("organizationMembers", {
        organizationMemberId: membership.organizationMemberId,
      }),
    ).toMatchObject([{ displayName: "果果", grade: 3, memberType: "CHILD" }]);
  });

  it("lets an authorized reviewer reject a join request without creating membership", async () => {
    const seed = await invitationScenario();
    const created = await seed.invitations.createGroupInvitation(seed.teacher, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      groupId: seed.group.id,
      maxClaims: 10,
      requestId: "invite-create-reject",
    });
    const join = await seed.invitations.claimInvitation(seed.guardian, {
      childId: seed.child.id,
      code: created.code,
      disclosure: { avatar: false, displayName: true, grade: false },
      requestId: "invite-claim-reject",
    });

    const rejected = await seed.invitations.rejectJoinRequest(seed.teacher, {
      joinRequestId: join.id,
      requestId: "invite-reject",
    });

    expect(rejected.status).toBe("REJECTED");
    expect(
      await seed.harness.repository.query("childGroupMemberships", { childId: seed.child.id }),
    ).toHaveLength(0);
  });

  it("rejects an expired invitation", async () => {
    const seed = await invitationScenario("2026-09-05T10:00:00.000Z");
    const created = await seed.invitations.createGroupInvitation(seed.teacher, {
      expiresAt: "2026-09-05T10:01:00.000Z",
      groupId: seed.group.id,
      maxClaims: 1,
      requestId: "invite-create-expired",
    });
    seed.harness.clock.set("2026-09-05T10:02:00.000Z");

    await expect(
      seed.invitations.claimInvitation(seed.guardian, {
        childId: seed.child.id,
        code: created.code,
        disclosure: { avatar: false, displayName: true, grade: false },
        requestId: "invite-claim-expired",
      }),
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
  });

  it("returns the guardian's original claim when retrying a consumed one-time invitation", async () => {
    const seed = await invitationScenario();
    const created = await seed.invitations.createGroupInvitation(seed.teacher, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      groupId: seed.group.id,
      maxClaims: 1,
      requestId: "invite-create-once",
    });
    const first = await seed.invitations.claimInvitation(seed.guardian, {
      childId: seed.child.id,
      code: created.code,
      disclosure: { avatar: false, displayName: true, grade: false },
      requestId: "invite-claim-once",
    });

    await expect(
      seed.invitations.claimInvitation(seed.guardian, {
        childId: seed.child.id,
        code: created.code,
        disclosure: { avatar: false, displayName: true, grade: false },
        requestId: "invite-claim-twice",
      }),
    ).resolves.toMatchObject({ id: first.id });
  });

  it("supports a one-time roster seat claim that still requires approval", async () => {
    const seed = await invitationScenario();
    const seat = await seed.invitations.createRosterSeat(seed.teacher, {
      groupId: seed.group.id,
      requestId: "roster-create-1",
      rosterNumber: "S-001",
    });

    const join = await seed.invitations.claimRosterSeat(seed.guardian, {
      childId: seed.child.id,
      claimCode: seat.claimCode,
      disclosure: { avatar: false, displayName: true, grade: true },
      requestId: "roster-claim-1",
    });

    expect(join.status).toBe("PENDING_APPROVAL");
    expect(
      await seed.harness.repository.query("childGroupMemberships", { childId: seed.child.id }),
    ).toHaveLength(0);
  });
});
