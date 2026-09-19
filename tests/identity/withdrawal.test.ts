import { describe, expect, it, vi } from "vitest";

import { createCoreApi } from "../../src/application/core-api.js";
import { IdentityService } from "../../src/application/identity-service.js";
import { InvitationService } from "../../src/application/invitation-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createHarness } from "../helpers/harness.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

const platform: ActorContext = { accountId: "platform", mode: "PLATFORM" };

describe("group withdrawal", () => {
  it("rejects a sibling membership without consent or organization changes and binds replay to the child", async () => {
    const seed = await createIdentityScenario(2);
    const membership = seed.memberships[0]!;
    const sibling = seed.children[1]!;
    const api = createCoreApi(seed.harness);
    const command = {
      action: "WITHDRAW_CHILD",
      requestId: "withdraw-explicit-child",
      payload: { childId: seed.firstChild.id, childGroupMembershipId: membership.id },
    };
    const auth = { openId: "wx-scenario-guardian" };
    const mismatched = { ...command, payload: { ...command.payload, childId: sibling.id } };
    const beforeMembers = await seed.harness.repository.query("organizationMembers");
    const beforeConsents = await seed.harness.repository.query("consentRecords");

    expect(await api.handle(mismatched, auth)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await seed.harness.repository.read("childGroupMemberships", membership.id)).toEqual(
      membership,
    );
    expect(await seed.harness.repository.query("organizationMembers")).toEqual(beforeMembers);
    expect(await seed.harness.repository.query("consentRecords")).toEqual(beforeConsents);
    expect(
      await seed.harness.repository.query("commandReceipts", { action: "WITHDRAW_CHILD" }),
    ).toHaveLength(0);

    const withdrawn = await api.handle(command, auth);
    expect(withdrawn).toMatchObject({ ok: true, data: { status: "WITHDRAWN" } });
    expect(await api.handle(command, auth)).toEqual(withdrawn);
    expect(await api.handle(mismatched, auth)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(
      await seed.harness.repository.query("consentRecords", { action: "REVOKED" }),
    ).toMatchObject([{ childId: seed.firstChild.id, guardianAccountId: seed.guardian.accountId }]);
    expect(
      await seed.harness.repository.read("childGroupMemberships", seed.memberships[1]!.id),
    ).toMatchObject({ status: "ACTIVE", childId: sibling.id });
  });

  it.each([undefined, "", null])("requires an explicit withdrawal childId: %s", async (childId) => {
    const seed = await createIdentityScenario(1);
    const membership = seed.memberships[0]!;
    expect(
      await createCoreApi(seed.harness).handle(
        {
          action: "WITHDRAW_CHILD",
          requestId: "withdraw-missing-child",
          payload: { childId, childGroupMembershipId: membership.id },
        },
        { openId: "wx-scenario-guardian" },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect(await seed.harness.repository.read("childGroupMemberships", membership.id)).toEqual(
      membership,
    );
  });

  it.each(["membership-child", "guardian"])(
    "rechecks %s inside the withdrawal transaction",
    async (changed) => {
      const seed = await createIdentityScenario(2);
      const membership = seed.memberships[0]!;
      const original = seed.harness.repository.transaction.bind(seed.harness.repository);
      vi.spyOn(seed.harness.repository, "transaction").mockImplementationOnce(async (work) => {
        await original(async (tx) => {
          if (changed === "membership-child") {
            await tx.update("childGroupMemberships", membership.id, {
              childId: seed.children[1]!.id,
            });
          } else {
            for (const link of await tx.query("guardianLinks", { childId: seed.firstChild.id }))
              await tx.update("guardianLinks", link.id, { status: "WITHDRAWN" });
          }
        });
        return original(work);
      });
      await expect(
        seed.invitations.withdrawChild(seed.guardian, {
          childId: seed.firstChild.id,
          childGroupMembershipId: membership.id,
          requestId: "withdraw-transaction-scope",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        await seed.harness.repository.read("childGroupMemberships", membership.id),
      ).toMatchObject({ status: "ACTIVE" });
      expect(
        await seed.harness.repository.query("consentRecords", { action: "REVOKED" }),
      ).toHaveLength(0);
      expect(
        await seed.harness.repository.query("organizationMembers", { status: "WITHDRAWN" }),
      ).toHaveLength(0);
    },
  );

  it("stops future membership while preserving personal sunlight and trees", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    const invitations = new InvitationService(harness);
    const guardianAccount = await identity.createAccount({
      openId: "wx-g",
      requestId: "account-g",
    });
    const teacherAccount = await identity.createAccount({ openId: "wx-t", requestId: "account-t" });
    const guardian: ActorContext = { accountId: guardianAccount.id, mode: "ACCOUNT" };
    const teacher: ActorContext = { accountId: teacherAccount.id, mode: "ACCOUNT" };
    const family = await identity.createFamily(guardian, { name: "星星家", requestId: "family-g" });
    const child = await identity.addChild(guardian, {
      familyId: family.id,
      nickname: "乐乐",
      requestId: "child-g-1",
    });
    const organization = await identity.createOrganization(platform, {
      adminAccountId: teacher.accountId,
      name: "青禾学校",
      requestId: "organization-t",
      type: "SCHOOL",
    });
    const group = await identity.createGroup(teacher, {
      name: "二年级一班",
      organizationId: organization.id,
      requestId: "group-t-1",
      type: "SCHOOL_CLASS",
    });
    const invitation = await invitations.createGroupInvitation(teacher, {
      expiresAt: "2026-09-06T10:00:00.000Z",
      groupId: group.id,
      maxClaims: 1,
      requestId: "invite-withdraw",
    });
    const join = await invitations.claimInvitation(guardian, {
      childId: child.id,
      code: invitation.code,
      disclosure: { avatar: false, displayName: true, grade: false },
      requestId: "claim-withdraw",
    });
    const membership = await invitations.approveJoinRequest(teacher, {
      joinRequestId: join.id,
      requestId: "approve-withdraw",
    });
    await harness.repository.transaction(async (tx) => {
      await tx.insert("sunlightLedgers", {
        id: "sunlight-personal",
        actorAccountId: guardian.accountId,
        amount: 6,
        childId: child.id,
        createdAt: harness.clock.now(),
        reason: "TASK_COMPLETED",
        referenceId: "assignment-personal",
        requestId: "sunlight-personal",
      });
      await tx.insert("childTrees", {
        id: "tree-personal",
        carryOver: 0,
        catalogId: "starter-apple",
        childId: child.id,
        createdAt: harness.clock.now(),
        progress: 6,
        stage: "成熟采摘",
        status: "MATURE",
        updatedAt: harness.clock.now(),
      });
    });

    await invitations.withdrawChild(guardian, {
      childId: child.id,
      childGroupMembershipId: membership.id,
      requestId: "withdraw-1",
    });

    expect(await harness.repository.read("childGroupMemberships", membership.id)).toMatchObject({
      status: "WITHDRAWN",
    });
    expect(await harness.repository.read("sunlightLedgers", "sunlight-personal")).toMatchObject({
      amount: 6,
    });
    expect(await harness.repository.read("childTrees", "tree-personal")).toMatchObject({
      progress: 6,
      status: "MATURE",
    });
    expect(
      await harness.repository.query("consentRecords", {
        action: "REVOKED",
        childId: child.id,
      }),
    ).toHaveLength(1);
  });
});
