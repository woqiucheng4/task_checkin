import { describe, expect, it } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { ReviewService } from "../../src/application/review-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

describe("membership-sensitive Core API replays", () => {
  it.each(["ACADEMIC_REVIEW", "COMPLETE_REVISION"])(
    "reauthorizes %s after withdrawal, including old persisted receipts",
    async (action) => {
      const seed = await createSubmittedTaskScenario("ORGANIZATION");
      const membership = seed.memberships[0];
      if (!membership) throw new Error("Membership fixture missing");
      if (action === "COMPLETE_REVISION") {
        await new ReviewService(seed.harness, new SunlightService(seed.harness)).academicReview(
          seed.teacher,
          {
            assignmentId: seed.assignment.id,
            decision: "REVISION_REQUIRED",
            requestId: "replay-require-revision",
          },
        );
        await seed.submissions.supplement(seed.childActor, {
          childId: seed.firstChild.id,
          assignmentId: seed.assignment.id,
          mediaAssetIds: [],
          requestId: "replay-submit-revision",
        });
      }
      const api = createCoreApi(seed.harness);
      const command = {
        action,
        payload: { assignmentId: seed.assignment.id, decision: "APPROVE" },
        requestId: "sensitive-review-replay",
      };
      const auth = { openId: "wx-scenario-teacher" };
      const first = await api.handle(command, auth);
      expect(first.ok).toBe(true);
      expect(await api.handle(command, auth)).toEqual(first);
      if (!first.ok) throw new Error("Expected successful review");
      await seed.harness.repository.transaction((tx) =>
        tx.insert("commandReceipts", {
          id: "old-academic-receipt",
          accountId: seed.teacher.accountId,
          action,
          requestId: command.requestId,
          result: first.data,
          createdAt: seed.harness.clock.now(),
        }),
      );
      await seed.invitations.withdrawChild(seed.guardian, {
        childGroupMembershipId: membership.id,
        requestId: "replay-withdraw-child",
      });
      expect(await api.handle(command, auth)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
      expect(
        await seed.harness.repository.query("sunlightLedgers", { referenceId: seed.assignment.id }),
      ).toHaveLength(1);
    },
  );

  it("does not replay a claim receipt after the guardian loses authorization", async () => {
    const seed = await createIdentityScenario(2, 1);
    const child = seed.children[1];
    if (!child) throw new Error("Second child fixture missing");
    const childId = child.id;
    const invite = await seed.invitations.createGroupInvitation(seed.teacher, {
      groupId: seed.group.id,
      expiresAt: "2026-09-06T10:00:00.000Z",
      maxClaims: 1,
      requestId: "replay-invitation-create",
    });
    const api = createCoreApi(seed.harness);
    const command = {
      action: "CLAIM_INVITATION",
      payload: {
        childId,
        code: invite.code,
        disclosure: { avatar: false, displayName: true, grade: false },
      },
      requestId: "sensitive-claim-replay",
    };
    const auth = { openId: "wx-scenario-guardian" };
    const first = await api.handle(command, auth);
    expect(first.ok).toBe(true);
    expect(await api.handle(command, auth)).toEqual(first);
    if (!first.ok) throw new Error("Expected successful claim");
    await seed.harness.repository.transaction(async (tx) => {
      await tx.insert("commandReceipts", {
        id: "old-claim-receipt",
        accountId: seed.guardian.accountId,
        action: command.action,
        requestId: command.requestId,
        result: first.data,
        createdAt: seed.harness.clock.now(),
      });
      for (const link of await tx.query("guardianLinks", {
        accountId: seed.guardian.accountId,
        childId,
      }))
        await tx.update("guardianLinks", link.id, { status: "WITHDRAWN" });
    });
    expect(await api.handle(command, auth)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await seed.harness.repository.read("invitations", invite.id)).toMatchObject({
      claimCount: 1,
    });
  });
});
