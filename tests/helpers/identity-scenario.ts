import { IdentityService } from "../../src/application/identity-service.js";
import { InvitationService } from "../../src/application/invitation-service.js";
import { TeacherActivationService } from "../../src/application/teacher-activation-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createHarness } from "./harness.js";

export async function createIdentityScenario(childCount = 2, joinedChildCount = childCount) {
  if (!Number.isInteger(childCount) || childCount < 1) {
    throw new Error("identity scenario requires at least one child");
  }
  if (
    !Number.isInteger(joinedChildCount) ||
    joinedChildCount < 0 ||
    joinedChildCount > childCount
  ) {
    throw new Error("joined child count must be between zero and child count");
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
  const organization = await withTeacherActivationPepper(async () => {
    const activation = await activations.issue(platform, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      requestId: "scenario-activation-issue",
    });
    return identity.activateTeacherWorkspace(teacher, {
      code: activation.code,
      requestId: "scenario-activation-redeem",
      workspaceName: "青禾老师",
    });
  });
  const group = await identity.createGroup(teacher, {
    name: "三年级学习小组",
    organizationId: organization.id,
    requestId: "scenario-group",
    type: "LEARNING_GROUP",
  });
  const invitation = await invitations.createGroupInvitation(teacher, {
    expiresAt: "2026-09-06T10:00:00.000Z",
    groupId: group.id,
    maxClaims: joinedChildCount,
    requestId: "scenario-invitation",
  });
  const memberships = [];
  for (const [index, child] of children.slice(0, joinedChildCount).entries()) {
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

async function withTeacherActivationPepper<T>(work: () => Promise<T>): Promise<T> {
  const previous = process.env.TEACHER_ACTIVATION_PEPPER;
  process.env.TEACHER_ACTIVATION_PEPPER = "identity-scenario-test-pepper";
  try {
    return await work();
  } finally {
    if (previous === undefined) delete process.env.TEACHER_ACTIVATION_PEPPER;
    else process.env.TEACHER_ACTIVATION_PEPPER = previous;
  }
}
