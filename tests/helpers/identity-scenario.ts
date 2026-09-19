import { IdentityService } from "../../src/application/identity-service.js";
import { InvitationService } from "../../src/application/invitation-service.js";
import { TeacherActivationService } from "../../src/application/teacher-activation-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createHarness } from "./harness.js";

export async function createIdentityScenario(childCount = 2) {
  if (!Number.isInteger(childCount) || childCount < 1) {
    throw new Error("identity scenario requires at least one child");
  }
  const harness = createHarness();
  const identity = new IdentityService(harness);
  const invitations = new InvitationService(harness);
  const activations = new TeacherActivationService(harness);
  const platform: ActorContext = { accountId: "platform-operator", mode: "PLATFORM" };
  const guardianAccount = await identity.createAccount({
    openId: "wx-scenario-guardian",
    requestId: "scenario-account-guardian",
  });
  const teacherAccount = await identity.createAccount({
    openId: "wx-scenario-teacher",
    requestId: "scenario-account-teacher",
  });
  const guardian: ActorContext = { accountId: guardianAccount.id, mode: "ACCOUNT" };
  const teacher: ActorContext = { accountId: teacherAccount.id, mode: "ACCOUNT" };
  const family = await identity.createFamily(guardian, {
    name: "晨光家",
    requestId: "scenario-family",
  });
  const children = [];
  for (let index = 0; index < childCount; index += 1) {
    children.push(
      await identity.addChild(guardian, {
        familyId: family.id,
        grade: 3,
        nickname: `孩子${index + 1}`,
        requestId: `scenario-child-${index + 1}`,
      }),
    );
  }
  process.env.TEACHER_ACTIVATION_PEPPER ??= "identity-scenario-test-pepper";
  const activation = await activations.issue(platform, {
    expiresAt: "2026-09-06T10:00:00.000Z",
    requestId: "scenario-activation-issue",
  });
  const organization = await identity.activateTeacherWorkspace(teacher, {
    code: activation.code,
    requestId: "scenario-activation-redeem",
    workspaceName: "青禾学校",
  });
  const group = await identity.createGroup(teacher, {
    name: "三年级一班",
    organizationId: organization.id,
    requestId: "scenario-group",
    type: "LEARNING_GROUP",
  });
  const invitation = await invitations.createGroupInvitation(teacher, {
    expiresAt: "2026-09-06T10:00:00.000Z",
    groupId: group.id,
    maxClaims: childCount,
    requestId: "scenario-invitation",
  });
  const memberships = [];
  for (const [index, child] of children.entries()) {
    const join = await invitations.claimInvitation(guardian, {
      childId: child.id,
      code: invitation.code,
      disclosure: { avatar: false, displayName: true, grade: true },
      requestId: `scenario-claim-${index + 1}`,
    });
    memberships.push(
      await invitations.approveJoinRequest(teacher, {
        joinRequestId: join.id,
        requestId: `scenario-approve-${index + 1}`,
      }),
    );
  }
  const firstChild = children[0];
  if (firstChild === undefined) {
    throw new Error("identity scenario failed to create its first child");
  }

  return {
    children,
    firstChild,
    family,
    group,
    guardian,
    harness,
    identity,
    invitations,
    memberships,
    organization,
    platform,
    teacher,
  };
}
