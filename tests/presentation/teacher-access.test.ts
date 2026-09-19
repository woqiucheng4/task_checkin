import { describe, expect, it } from "vitest";
import { PresentationService } from "../../src/application/presentation-service.js";
import { GroupOrchardService } from "../../src/application/group-orchard-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("teacher workspace authorization", () => {
  it("removes a withdrawn child's submissions from the old group's review queue even while they remain in the organization", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "TEXT");
    const other = await seed.identity.createGroup(seed.teacher, {
      name: "另一分组",
      organizationId: seed.organization.id,
      type: "LEARNING_GROUP",
      requestId: "queue-other-group-0001",
    });
    const invite = await seed.invitations.createGroupInvitation(seed.teacher, {
      groupId: other.id,
      maxClaims: 1,
      expiresAt: "2026-09-06T10:00:00Z",
      requestId: "queue-other-invite-0001",
    });
    const join = await seed.invitations.claimInvitation(seed.guardian, {
      childId: seed.firstChild.id,
      code: invite.code,
      disclosure: { displayName: true, grade: false, avatar: false },
      requestId: "queue-other-claim-0001",
    });
    await seed.invitations.approveJoinRequest(seed.teacher, {
      joinRequestId: join.id,
      requestId: "queue-other-approve-0001",
    });
    const membership = seed.memberships[0];
    if (!membership) throw new Error("Missing membership");
    await seed.invitations.withdrawChild(seed.guardian, {
      childGroupMembershipId: membership.id,
      requestId: "queue-withdraw-0001",
    });
    const service = new PresentationService(seed.harness);
    expect(
      await service.reviewQueue(seed.teacher, { kind: "GROUP", groupId: seed.group.id }),
    ).toMatchObject({ items: [] });
  });
  it("projects actual submissions and pending joins without private family identifiers", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "TEXT");
    const service = new PresentationService(seed.harness);
    const submissions = await service.groupSubmissions(seed.teacher, {
      groupId: seed.group.id,
      taskId: seed.task.id,
    });
    expect(submissions).toMatchObject([
      {
        id: seed.assignment.id,
        title: "整理书桌",
        name: "孩子1",
        taskState: "SUBMITTED",
        academicState: "PENDING",
      },
    ]);
    expect(submissions[0]).not.toHaveProperty("childId");
    const child = await seed.identity.addChild(seed.guardian, {
      familyId: seed.family.id,
      nickname: "新成员",
      requestId: "teacher-pending-child-0001",
    });
    const invitation = await seed.invitations.createGroupInvitation(seed.teacher, {
      groupId: seed.group.id,
      maxClaims: 10,
      expiresAt: "2026-09-06T10:00:00Z",
      requestId: "teacher-pending-invite-0001",
    });
    const request = await seed.invitations.claimInvitation(seed.guardian, {
      code: invitation.code,
      childId: child.id,
      disclosure: { displayName: false, grade: false, avatar: false },
      requestId: "teacher-pending-claim-0001",
    });
    const joins = await service.groupJoinRequests(seed.teacher, seed.group.id);
    expect(joins).toMatchObject([{ id: request.id, name: "未披露昵称" }]);
    expect(JSON.stringify(joins)).not.toContain("新成员");
    await expect(service.groupJoinRequests(seed.guardian, seed.group.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("lets an existing organization administrator open their own group, not another family's data", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "TEXT");
    const service = new PresentationService(seed.harness);
    expect((await service.accountShell(seed.teacher)).groups).toMatchObject([
      { id: seed.group.id, role: "TEACHER" },
    ]);
    expect(await service.groupWorkspace(seed.teacher, { groupId: seed.group.id })).toMatchObject({
      group: { id: seed.group.id },
      members: [{ displayName: "孩子1" }],
    });
    expect(
      await service.reviewQueue(seed.teacher, { kind: "GROUP", groupId: seed.group.id }),
    ).toMatchObject({ items: [{ assignmentId: seed.assignment.id }] });
    await expect(
      service.groupWorkspace(seed.guardian, { groupId: seed.group.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("keeps a mature group tree visible so the teacher can harvest it", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    await seed.identity.bindGroupRole(seed.teacher, {
      accountId: seed.teacher.accountId,
      groupId: seed.group.id,
      role: "TEACHER",
      requestId: "teacher-bind-tree-0001",
    });
    const tree = await new GroupOrchardService(seed.harness).startGroupTree(seed.teacher, {
      groupId: seed.group.id,
      catalogId: "starter-apple",
      requestId: "teacher-tree-start-0001",
    });
    await seed.harness.repository.transaction((tx) =>
      tx.update("groupTrees", tree.id, { status: "MATURE", progress: tree.threshold }),
    );
    expect(
      await new PresentationService(seed.harness).groupWorkspace(seed.teacher, {
        groupId: seed.group.id,
      }),
    ).toMatchObject({ groupTree: { id: tree.id, status: "MATURE", progress: tree.threshold } });
  });
});
