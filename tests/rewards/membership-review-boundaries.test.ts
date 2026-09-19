import { describe, expect, it, vi } from "vitest";
import { ReviewService } from "../../src/application/review-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("academic review uses current transactional membership", () => {
  it.each(["before", "at-transaction"])(
    "rejects a withdrawal %s review without granting sunlight",
    async (timing) => {
      const seed = await createSubmittedTaskScenario("ORGANIZATION");
      const membership = seed.memberships[0];
      if (!membership) throw new Error("Membership fixture missing");
      const withdraw = () =>
        seed.invitations.withdrawChild(seed.guardian, {
          childGroupMembershipId: membership.id,
          requestId: "review-withdraw-boundary",
        });
      if (timing === "before") await withdraw();
      else {
        const original = seed.harness.repository.transaction.bind(seed.harness.repository);
        vi.spyOn(seed.harness.repository, "transaction").mockImplementationOnce(async (work) => {
          await withdraw();
          return original(work);
        });
      }
      const service = new ReviewService(seed.harness, new SunlightService(seed.harness));
      await expect(
        service.academicReview(seed.teacher, {
          assignmentId: seed.assignment.id,
          decision: "APPROVE",
          requestId: "withdrawn-review-command",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await seed.harness.repository.query("sunlightLedgers")).toHaveLength(0);
      expect(await seed.harness.repository.query("reviewRecords")).toHaveLength(0);
    },
  );

  it.each(["group", "organization", "binding", "teacher-membership"])(
    "rejects a revoked %s inside review transaction",
    async (target) => {
      const seed = await createSubmittedTaskScenario("ORGANIZATION");
      const original = seed.harness.repository.transaction.bind(seed.harness.repository);
      vi.spyOn(seed.harness.repository, "transaction").mockImplementationOnce(async (work) => {
        await original(async (tx) => {
          if (target === "group") await tx.update("groups", seed.group.id, { status: "INACTIVE" });
          if (target === "organization")
            await tx.update("organizations", seed.organization.id, { status: "INACTIVE" });
          if (target === "binding")
            for (const binding of await tx.query("groupRoleBindings", {
              accountId: seed.teacher.accountId,
            }))
              await tx.update("groupRoleBindings", binding.id, { status: "WITHDRAWN" });
          if (target === "teacher-membership")
            for (const member of await tx.query("organizationMembers", {
              accountId: seed.teacher.accountId,
            }))
              await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
        });
        return original(work);
      });
      await expect(
        new ReviewService(seed.harness, new SunlightService(seed.harness)).academicReview(
          seed.teacher,
          {
            assignmentId: seed.assignment.id,
            decision: "APPROVE",
            requestId: "revoked-review-command",
          },
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await seed.harness.repository.query("sunlightLedgers")).toHaveLength(0);
    },
  );

  it("allows the corresponding assistant, rejects a teacher bound only to another group, and preserves one reward", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const secondGroup = await seed.identity.createGroup(seed.teacher, {
      organizationId: seed.organization.id,
      name: "另一个组",
      type: "LEARNING_GROUP",
      requestId: "second-review-group",
    });
    const teacherAccount = await seed.identity.createAccount({
      openId: "other-group-reviewer",
      requestId: "other-group-account",
    });
    const other = { accountId: teacherAccount.id, mode: "ACCOUNT" as const };
    await seed.identity.bindGroupRole(seed.teacher, {
      accountId: other.accountId,
      groupId: secondGroup.id,
      role: "TEACHER",
      requestId: "other-group-binding",
    });
    const service = new ReviewService(seed.harness, new SunlightService(seed.harness));
    const input = {
      assignmentId: seed.assignment.id,
      decision: "APPROVE" as const,
      requestId: "scoped-review-command",
    };
    await expect(service.academicReview(other, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await seed.identity.bindGroupRole(seed.teacher, {
      accountId: other.accountId,
      groupId: seed.group.id,
      role: "ASSISTANT",
      requestId: "matching-assistant-binding",
    });
    const approved = await service.academicReview(other, input);
    expect((await service.academicReview(other, input)).review.id).toBe(approved.review.id);
    expect(
      (await service.academicReview(seed.teacher, { ...input, requestId: "owner-review-retry" }))
        .review.id,
    ).toBe(approved.review.id);
    const membership = seed.memberships[0];
    if (!membership) throw new Error("Membership fixture missing");
    await seed.invitations.withdrawChild(seed.guardian, {
      childGroupMembershipId: membership.id,
      requestId: "withdraw-after-approved",
    });
    await expect(service.academicReview(other, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await seed.harness.repository.query("sunlightLedgers")).toHaveLength(1);
  });
});
