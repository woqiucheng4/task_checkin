import { describe, expect, it, vi } from "vitest";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

async function scenario(maxClaims = 1) {
  const seed = await createIdentityScenario(3, 1);
  const child = seed.children[1];
  const otherChild = seed.children[2];
  if (!child || !otherChild) throw new Error("Child fixtures missing");
  const invitation = await seed.invitations.createGroupInvitation(seed.teacher, {
    groupId: seed.group.id,
    expiresAt: "2026-09-06T10:00:00.000Z",
    maxClaims,
    requestId: "concurrent-invitation-create",
  });
  const input = {
    childId: child.id,
    code: invitation.code,
    disclosure: { avatar: false, displayName: true, grade: true },
    requestId: "concurrent-invitation-claim",
  };
  return { ...seed, invitation, input, otherChild };
}

describe("transactional invitation bounds", () => {
  it("allows only one of concurrent different-child claims for maxClaims=1", async () => {
    const seed = await scenario();
    const results = await Promise.allSettled([
      seed.invitations.claimInvitation(seed.guardian, seed.input),
      seed.invitations.claimInvitation(seed.guardian, {
        ...seed.input,
        childId: seed.otherChild.id,
        requestId: "concurrent-other-child",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toMatchObject([
      { reason: { code: "INVITATION_EXPIRED" } },
    ]);
    expect(
      await seed.harness.repository.query("joinRequests", { invitationId: seed.invitation.id }),
    ).toHaveLength(1);
    expect(await seed.harness.repository.read("invitations", seed.invitation.id)).toMatchObject({
      claimCount: 1,
      status: "CONSUMED",
    });
  });

  it("returns the same claim on concurrent same-child retries with one consent and count", async () => {
    const seed = await scenario();
    const [a, b] = await Promise.all([
      seed.invitations.claimInvitation(seed.guardian, seed.input),
      seed.invitations.claimInvitation(seed.guardian, {
        ...seed.input,
        requestId: "retry-with-new-request-id",
      }),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await seed.harness.repository.query("consentRecords", { childId: seed.input.childId }),
    ).toHaveLength(1);
    expect(
      await seed.harness.repository.query("joinRequests", { invitationId: seed.invitation.id }),
    ).toHaveLength(1);
    expect(await seed.harness.repository.read("invitations", seed.invitation.id)).toMatchObject({
      claimCount: 1,
    });
    await seed.invitations.approveJoinRequest(seed.teacher, {
      joinRequestId: a.id,
      requestId: "approve-before-claim-retry",
    });
    expect(await seed.invitations.claimInvitation(seed.guardian, seed.input)).toMatchObject({
      id: a.id,
      status: "APPROVED",
    });
    await expect(
      seed.invitations.claimInvitation(
        { accountId: "unrelated-guardian", mode: "ACCOUNT" },
        seed.input,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each([1, 2])(
    "does not return one guardian's claim to another guardian for maxClaims=%i",
    async (maxClaims) => {
      const seed = await scenario(maxClaims);
      const account = await seed.identity.createAccount({
        openId: "second-guardian",
        requestId: "second-guardian-account",
      });
      const otherGuardian = { accountId: account.id, mode: "ACCOUNT" as const };
      const original = (
        await seed.harness.repository.query("guardianLinks", { childId: seed.input.childId })
      )[0];
      if (!original) throw new Error("Guardian fixture missing");
      await seed.harness.repository.transaction((tx) =>
        tx.insert("guardianLinks", {
          ...original,
          id: "second-guardian-link",
          accountId: otherGuardian.accountId,
        }),
      );
      const results = await Promise.allSettled([
        seed.invitations.claimInvitation(seed.guardian, seed.input),
        seed.invitations.claimInvitation(otherGuardian, {
          ...seed.input,
          requestId: "other-guardian-claim",
        }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toMatchObject([
        { reason: { code: maxClaims === 1 ? "INVITATION_EXPIRED" : "ALREADY_EXISTS" } },
      ]);
      expect(
        await seed.harness.repository.query("consentRecords", { childId: seed.input.childId }),
      ).toHaveLength(1);
      expect(await seed.harness.repository.read("invitations", seed.invitation.id)).toMatchObject({
        claimCount: 1,
      });
    },
  );

  it.each(["revoked", "expired", "full"])(
    "rechecks invitation %s at transaction admission",
    async (state) => {
      const seed = await scenario();
      const original = seed.harness.repository.transaction.bind(seed.harness.repository);
      vi.spyOn(seed.harness.repository, "transaction").mockImplementationOnce(async (work) => {
        if (state === "expired") seed.harness.clock.set("2026-09-07T10:00:00.000Z");
        else
          await original((tx) =>
            tx.update(
              "invitations",
              seed.invitation.id,
              state === "revoked" ? { status: "REVOKED" } : { claimCount: 1, status: "CONSUMED" },
            ),
          );
        return original(work);
      });
      await expect(
        seed.invitations.claimInvitation(seed.guardian, seed.input),
      ).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
      expect(
        await seed.harness.repository.query("joinRequests", { invitationId: seed.invitation.id }),
      ).toHaveLength(0);
      expect(
        await seed.harness.repository.query("consentRecords", { childId: seed.input.childId }),
      ).toHaveLength(0);
    },
  );

  it("concurrent approvals create only one active membership", async () => {
    const seed = await scenario();
    const join = await seed.invitations.claimInvitation(seed.guardian, seed.input);
    const input = { joinRequestId: join.id, requestId: "concurrent-approval-command" };
    const results = await Promise.allSettled([
      seed.invitations.approveJoinRequest(seed.teacher, input),
      seed.invitations.approveJoinRequest(seed.teacher, {
        ...input,
        requestId: "second-approval-command",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await seed.harness.repository.query("childGroupMemberships", {
        childId: seed.input.childId,
        status: "ACTIVE",
      }),
    ).toHaveLength(1);
  });

  it.each(["guardian", "invitation", "group", "reviewer", "request"])(
    "rechecks %s before approval writes",
    async (target) => {
      const seed = await scenario();
      const join = await seed.invitations.claimInvitation(seed.guardian, seed.input);
      const original = seed.harness.repository.transaction.bind(seed.harness.repository);
      vi.spyOn(seed.harness.repository, "transaction").mockImplementationOnce(async (work) => {
        await original(async (tx) => {
          if (target === "guardian")
            for (const link of await tx.query("guardianLinks", { childId: join.childId }))
              await tx.update("guardianLinks", link.id, { status: "WITHDRAWN" });
          if (target === "invitation")
            await tx.update("invitations", seed.invitation.id, { status: "REVOKED" });
          if (target === "group") await tx.update("groups", seed.group.id, { status: "INACTIVE" });
          if (target === "request")
            await tx.update("joinRequests", join.id, { status: "REJECTED" });
          if (target === "reviewer")
            for (const member of await tx.query("organizationMembers", {
              accountId: seed.teacher.accountId,
            }))
              await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
        });
        return original(work);
      });
      await expect(
        seed.invitations.approveJoinRequest(seed.teacher, {
          joinRequestId: join.id,
          requestId: "revoked-approval-command",
        }),
      ).rejects.toMatchObject({ code: expect.any(String) });
      expect(
        await seed.harness.repository.query("childGroupMemberships", {
          childId: seed.input.childId,
        }),
      ).toHaveLength(0);
    },
  );
});
