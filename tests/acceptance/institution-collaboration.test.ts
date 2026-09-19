import { describe, expect, it } from "vitest";
import type {
  ChildGroupMembership,
  JoinRequest,
  Task,
  TaskAssignment,
} from "../../src/domain/model.js";
import type { CreatedInvitation } from "../../src/application/invitation-service.js";
import type { OrganizationChildView } from "../../src/application/identity-service.js";
import type { OrchardView } from "../../src/application/orchard-service.js";
import { AcceptanceScenario, ORDINARY_TASK } from "./scenario.js";

describe("institution collaboration acceptance", () => {
  it("AC-ORG-001 joins with consent, receives group work, and receives one teacher-approved reward", async () => {
    const scenario = new AcceptanceScenario();
    const family = await scenario.createFamilyWithChild();
    const institution = await scenario.createInstitution();
    const childActor = { mode: "ACCOUNT" as const };
    const invitation = await scenario.call<CreatedInvitation>(
      institution.teacherOpenId,
      "CREATE_GROUP_INVITATION",
      {
        expiresAt: "2026-09-06T10:00:00.000Z",
        groupId: institution.group.id,
        maxClaims: 1,
      },
    );
    const join = await scenario.call<JoinRequest>(family.openId, "CLAIM_INVITATION", {
      childId: family.child.id,
      code: invitation.code,
      disclosure: { avatar: false, displayName: true, grade: true },
    });
    const membership = await scenario.call<ChildGroupMembership>(
      institution.teacherOpenId,
      "APPROVE_JOIN_REQUEST",
      { joinRequestId: join.id },
    );
    const task = await scenario.call<Task>(institution.teacherOpenId, "PUBLISH_GROUP_TASK", {
      ...ORDINARY_TASK,
      groupId: institution.group.id,
      requiresAcademicReview: true,
      title: "班级数学练习",
    });
    const assignment = (
      await scenario.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0] as TaskAssignment;
    await scenario.call(
      family.openId,
      "SUBMIT_TASK",
      { childId: family.child.id, assignmentId: assignment.id, mediaAssetIds: [] },
      { actor: childActor },
    );
    await scenario.call(institution.teacherOpenId, "ACADEMIC_REVIEW", {
      assignmentId: assignment.id,
      decision: "APPROVE",
    });

    await expect(
      scenario.harness.repository.query("sunlightLedgers", { referenceId: assignment.id }),
    ).resolves.toHaveLength(1);

    const organizationView = await scenario.call<OrganizationChildView>(
      institution.teacherOpenId,
      "GET_ORGANIZATION_CHILD",
      { organizationMemberId: membership.organizationMemberId },
    );
    expect(organizationView).toEqual({
      displayName: "小满",
      grade: 3,
      organizationMemberId: membership.organizationMemberId,
    });
    expect(organizationView).not.toHaveProperty("childId");
  });

  it("AC-ORG-002 blocks cross-tenant reads and preserves the personal orchard after withdrawal", async () => {
    const scenario = new AcceptanceScenario();
    const family = await scenario.createFamilyWithChild();
    const institution = await scenario.createInstitution();
    const outsiderOpenId = "wx-acceptance-outsider";
    await scenario.bootstrap(outsiderOpenId);
    const childActor = { mode: "ACCOUNT" as const };
    const invitation = await scenario.call<CreatedInvitation>(
      institution.teacherOpenId,
      "CREATE_GROUP_INVITATION",
      {
        expiresAt: "2026-09-06T10:00:00.000Z",
        groupId: institution.group.id,
        maxClaims: 1,
      },
    );
    const join = await scenario.call<JoinRequest>(family.openId, "CLAIM_INVITATION", {
      childId: family.child.id,
      code: invitation.code,
      disclosure: { avatar: false, displayName: false, grade: false },
    });
    const membership = await scenario.call<ChildGroupMembership>(
      institution.teacherOpenId,
      "APPROVE_JOIN_REQUEST",
      { joinRequestId: join.id },
    );

    expect(
      await scenario.result(outsiderOpenId, "GET_ORGANIZATION_CHILD", {
        organizationMemberId: membership.organizationMemberId,
      }),
    ).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });

    const task = await scenario.call<Task>(family.openId, "PUBLISH_FAMILY_TASK", {
      ...ORDINARY_TASK,
      childIds: [family.child.id],
      familyId: family.family.id,
    });
    const assignment = (
      await scenario.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0] as TaskAssignment;
    await scenario.call(
      family.openId,
      "SUBMIT_TASK",
      { childId: family.child.id, assignmentId: assignment.id, mediaAssetIds: [] },
      { actor: childActor },
    );
    await scenario.call(family.openId, "FAMILY_REVIEW", {
      childId: family.child.id,
      assignmentId: assignment.id,
      decision: "APPROVE",
    });
    await scenario.call(family.openId, "WITHDRAW_CHILD", {
      childId: family.child.id,
      childGroupMembershipId: membership.id,
    });

    const orchard = await scenario.call<OrchardView>(
      family.openId,
      "GET_CHILD_ORCHARD",
      { childId: family.child.id },
      { actor: childActor },
    );
    expect(orchard).toMatchObject({ currentTree: { progress: 2 }, lifetimeSunlight: 2 });
    expect(
      await scenario.result(
        family.openId,
        "GET_GROUP_PROGRESS",
        { childId: family.child.id, groupId: institution.group.id },
        { actor: childActor },
      ),
    ).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
  });
});
