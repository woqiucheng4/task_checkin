import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdentityService } from "../../src/application/identity-service.js";
import { InvitationService } from "../../src/application/invitation-service.js";
import { PresentationService } from "../../src/application/presentation-service.js";
import { TeacherActivationService } from "../../src/application/teacher-activation-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createHarness } from "../helpers/harness.js";

const platform: ActorContext = { accountId: "platform-operator", mode: "PLATFORM" };
const pepper = "teacher-workspace-test-pepper";

async function teacherWorkspaceScenario() {
  const harness = createHarness();
  const identity = new IdentityService(harness);
  const invitations = new InvitationService(harness);
  const activations = new TeacherActivationService(harness);
  const guardianAccount = await identity.createAccount({
    openId: "wx-workspace-guardian",
    requestId: "workspace-account-guardian",
  });
  const teacherAccount = await identity.createAccount({
    openId: "wx-workspace-teacher",
    requestId: "workspace-account-teacher",
  });
  const otherTeacherAccount = await identity.createAccount({
    openId: "wx-workspace-other-teacher",
    requestId: "workspace-account-other-teacher",
  });
  const guardian: ActorContext = { accountId: guardianAccount.id, mode: "ACCOUNT" };
  const teacher: ActorContext = { accountId: teacherAccount.id, mode: "ACCOUNT" };
  const otherTeacher: ActorContext = { accountId: otherTeacherAccount.id, mode: "ACCOUNT" };
  const family = await identity.createFamily(guardian, {
    name: "晨光家",
    requestId: "workspace-family",
  });
  const children = await Promise.all(
    ["果果", "芽芽"].map((nickname, index) =>
      identity.addChild(guardian, {
        familyId: family.id,
        nickname,
        requestId: `workspace-child-${index + 1}`,
      }),
    ),
  );
  const activation = await activations.issue(platform, {
    expiresAt: "2026-09-06T10:00:00.000Z",
    requestId: "workspace-activation-issue",
  });
  const workspace = await identity.activateTeacherWorkspace(teacher, {
    code: activation.code,
    requestId: "workspace-activation-redeem",
    workspaceName: "青禾老师",
  });
  return { children, guardian, harness, identity, invitations, otherTeacher, teacher, workspace };
}

describe("teacher-owned learning groups", () => {
  beforeEach(() => vi.stubEnv("TEACHER_ACTIVATION_PEPPER", pepper));
  afterEach(() => vi.unstubAllEnvs());

  it("lets only the activated workspace admin create learning groups", async () => {
    const seed = await teacherWorkspaceScenario();
    const input = {
      name: "三年级学习小组",
      organizationId: seed.workspace.id,
      requestId: "workspace-group-create",
      type: "LEARNING_GROUP" as const,
    };
    const group = await seed.identity.createGroup(seed.teacher, input);

    expect(group).toMatchObject({ organizationId: seed.workspace.id, type: "LEARNING_GROUP" });
    await expect(
      seed.identity.createGroup(seed.otherTeacher, {
        ...input,
        name: "越权分组",
        requestId: "workspace-group-forbidden",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const type of ["SCHOOL_CLASS", "TUTORING_CLASS"] as const) {
      await expect(
        seed.identity.createGroup(seed.teacher, {
          ...input,
          requestId: `workspace-group-${type.toLowerCase()}`,
          type,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("keeps an unclaimed sibling out of the selected child's group view", async () => {
    const seed = await teacherWorkspaceScenario();
    const group = await seed.identity.createGroup(seed.teacher, {
      name: "三年级学习小组",
      organizationId: seed.workspace.id,
      requestId: "workspace-sibling-group",
      type: "LEARNING_GROUP",
    });
    const invitation = await seed.invitations.createGroupInvitation(seed.teacher, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      groupId: group.id,
      maxClaims: 2,
      requestId: "workspace-sibling-invitation",
    });
    const firstChild = seed.children[0];
    const secondChild = seed.children[1];
    if (firstChild === undefined || secondChild === undefined) throw new Error("missing sibling");
    const join = await seed.invitations.claimInvitation(seed.guardian, {
      childId: firstChild.id,
      code: invitation.code,
      disclosure: { avatar: false, displayName: true, grade: false },
      requestId: "workspace-sibling-claim",
    });
    await seed.invitations.approveJoinRequest(seed.teacher, {
      joinRequestId: join.id,
      requestId: "workspace-sibling-approve",
    });

    const presentation = new PresentationService(seed.harness);
    expect((await presentation.childGroups(seed.guardian, firstChild.id)).memberships).toHaveLength(1);
    expect((await presentation.childGroups(seed.guardian, secondChild.id)).memberships).toEqual([]);
  });
});
