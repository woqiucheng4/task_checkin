import { describe, expect, it } from "vitest";
import { GroupOrchardService } from "../../src/application/group-orchard-service.js";
import { IdentityService } from "../../src/application/identity-service.js";
import { InvitationService } from "../../src/application/invitation-service.js";
import { TaskService } from "../../src/application/task-service.js";
import type { ActorContext, TaskAssignment } from "../../src/domain/model.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

describe("membership and group orchard boundaries", () => {
  it("covers invitation expiry, capacity, duplicate, rejection, roster, and withdrawal paths", async () => {
    const seed = await createIdentityScenario(1);
    const invitations = new InvitationService(seed.harness);
    const identity = new IdentityService(seed.harness);
    await expect(
      invitations.createGroupInvitation(seed.teacher, {
        expiresAt: seed.harness.clock.now(),
        groupId: seed.group.id,
        maxClaims: 1,
        requestId: "invite-expired-date",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      invitations.createGroupInvitation(seed.teacher, {
        expiresAt: "2026-09-06T10:00:00.000Z",
        groupId: seed.group.id,
        maxClaims: 0,
        requestId: "invite-capacity-low",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      invitations.createGroupInvitation(seed.teacher, {
        expiresAt: "2026-09-06T10:00:00.000Z",
        groupId: seed.group.id,
        maxClaims: 501,
        requestId: "invite-capacity-high",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      invitations.claimInvitation(seed.guardian, {
        childId: seed.firstChild.id,
        code: "missing",
        disclosure: { avatar: false, displayName: true, grade: true },
        requestId: "invite-code-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const activeInvite = await invitations.createGroupInvitation(seed.teacher, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      groupId: seed.group.id,
      maxClaims: 1,
      requestId: "invite-active-create",
    });
    await expect(
      invitations.claimInvitation(seed.guardian, {
        childId: seed.firstChild.id,
        code: activeInvite.code,
        disclosure: { avatar: false, displayName: true, grade: true },
        requestId: "invite-existing-member",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });

    const second = await identity.addChild(seed.guardian, {
      familyId: seed.family.id,
      nickname: "第二个孩子",
      requestId: "invite-second-child",
    });
    const secondActor: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: second.id,
      mode: "CHILD",
    };
    const secondInvite = await invitations.createGroupInvitation(seed.teacher, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      groupId: seed.group.id,
      maxClaims: 1,
      requestId: "invite-second-create",
    });
    const join = await invitations.claimInvitation(seed.guardian, {
      childId: second.id,
      code: secondInvite.code,
      disclosure: { avatar: false, displayName: false, grade: false },
      requestId: "invite-second-claim",
    });
    await expect(
      invitations.claimInvitation(seed.guardian, {
        childId: second.id,
        code: secondInvite.code,
        disclosure: { avatar: false, displayName: false, grade: false },
        requestId: "invite-second-claim-repeat",
      }),
    ).resolves.toMatchObject({ id: join.id, status: "PENDING_APPROVAL" });
    expect(
      (
        await invitations.rejectJoinRequest(seed.teacher, {
          joinRequestId: join.id,
          requestId: "invite-join-reject",
        })
      ).status,
    ).toBe("REJECTED");
    await expect(
      invitations.rejectJoinRequest(seed.teacher, {
        joinRequestId: join.id,
        requestId: "invite-join-reject-repeat",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      invitations.createRosterSeat(seed.teacher, {
        groupId: seed.group.id,
        requestId: "roster-number-empty",
        rosterNumber: "",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const seat = await invitations.createRosterSeat(seed.teacher, {
      groupId: seed.group.id,
      requestId: "roster-create-valid",
      rosterNumber: "S-002",
    });
    await expect(
      invitations.createRosterSeat(seed.teacher, {
        groupId: seed.group.id,
        requestId: "roster-create-duplicate",
        rosterNumber: "S-002",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    await expect(
      invitations.claimRosterSeat(seed.guardian, {
        childId: second.id,
        claimCode: "missing",
        disclosure: { avatar: false, displayName: true, grade: false },
        requestId: "roster-claim-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rosterJoin = await invitations.claimRosterSeat(seed.guardian, {
      childId: second.id,
      claimCode: seat.claimCode,
      disclosure: { avatar: false, displayName: true, grade: false },
      requestId: "roster-claim-valid",
    });
    const membership = await invitations.approveJoinRequest(seed.teacher, {
      joinRequestId: rosterJoin.id,
      requestId: "roster-approve-valid",
    });
    await invitations.withdrawChild(seed.guardian, {
      childGroupMembershipId: membership.id,
      requestId: "membership-withdraw-valid",
    });
    await expect(
      invitations.withdrawChild(seed.guardian, {
        childGroupMembershipId: membership.id,
        requestId: "membership-withdraw-repeat",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      new GroupOrchardService(seed.harness).groupProgressForChild(secondActor, seed.group.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("covers group-tree setup, contribution early exits, privacy, harvest, and replay", async () => {
    const seed = await createIdentityScenario(1);
    const groupOrchard = new GroupOrchardService(seed.harness);
    const tasks = new TaskService(seed.harness);
    const childActor: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: seed.firstChild.id,
      mode: "CHILD",
    };
    await expect(
      groupOrchard.startGroupTree(seed.guardian, {
        catalogId: "starter-apple",
        groupId: seed.group.id,
        requestId: "group-tree-forbidden",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      groupOrchard.startGroupTree(seed.teacher, {
        catalogId: "missing",
        groupId: seed.group.id,
        requestId: "group-tree-catalog-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const tree = await groupOrchard.startGroupTree(seed.teacher, {
      catalogId: "starter-apple",
      groupId: seed.group.id,
      requestId: "group-tree-start-valid",
    });
    await expect(
      groupOrchard.startGroupTree(seed.teacher, {
        catalogId: "starter-apple",
        groupId: seed.group.id,
        requestId: "group-tree-start-repeat",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      groupOrchard.groupProgressForChild(seed.guardian, seed.group.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      groupOrchard.harvestGroupTree(seed.teacher, {
        groupTreeId: tree.id,
        requestId: "group-tree-harvest-early",
        title: "纪念",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const task = await tasks.publishGroupTask(seed.teacher, {
      allowLateSubmission: true,
      category: "LIFE",
      dueAt: "2026-09-05T13:00:00.000Z",
      estimatedMinutes: 10,
      groupId: seed.group.id,
      importance: "REQUIRED",
      occurrenceDate: "2026-09-05",
      requestId: "group-tree-task",
      requiresAcademicReview: true,
      schedule: { date: "2026-09-05", kind: "ONCE" },
      startsAt: "2026-09-05T08:00:00.000Z",
      submissionMode: "CONFIRM",
      title: "集体任务",
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0];
    if (assignment === undefined) throw new Error("assignment missing");
    await seed.harness.repository.transaction(async (tx) => {
      expect(
        await groupOrchard.contributeForAcademicApproval(tx, {
          ...assignment,
          organizationId: undefined,
        } as unknown as TaskAssignment),
      ).toBeUndefined();
      expect(await groupOrchard.contributeForAcademicApproval(tx, assignment)).toMatchObject({
        amount: 1,
      });
      expect(await groupOrchard.contributeForAcademicApproval(tx, assignment)).toMatchObject({
        amount: 1,
      });
    });
    expect(await groupOrchard.groupProgressForChild(childActor, seed.group.id)).toMatchObject({
      progress: 1,
      threshold: 10,
    });

    await seed.harness.repository.transaction((tx) =>
      tx.update("groupTrees", tree.id, {
        maturedAt: seed.harness.clock.now(),
        progress: 10,
        stage: "成熟采摘",
        status: "MATURE",
        updatedAt: seed.harness.clock.now(),
      }),
    );
    await expect(
      groupOrchard.harvestGroupTree(seed.guardian, {
        groupTreeId: tree.id,
        requestId: "group-tree-harvest-outsider",
        title: "纪念",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const harvested = await groupOrchard.harvestGroupTree(seed.teacher, {
      groupTreeId: tree.id,
      requestId: "group-tree-harvest-valid",
      title: "我们的第一棵树",
    });
    expect(harvested.tree.status).toBe("HARVESTED");
    expect(
      await groupOrchard.harvestGroupTree(seed.teacher, {
        groupTreeId: tree.id,
        requestId: "group-tree-harvest-valid",
        title: "我们的第一棵树",
      }),
    ).toEqual(harvested);
  });
});
