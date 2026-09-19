import { describe, expect, it } from "vitest";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";
import { createCoreApi } from "../../src/application/core-api.js";

describe("submission detail access", () => {
  it("revokes teacher access to detail after the child leaves the group", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "TEXT");
    const membership = seed.memberships[0];
    if (!membership) throw new Error("Membership missing");
    await seed.invitations.withdrawChild(seed.guardian, {
      childGroupMembershipId: membership.id,
      requestId: "detail-withdraw-child-0001",
    });
    await expect(seed.submissions.detail(seed.teacher, seed.assignment.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(
      await seed.submissions.detail(seed.guardian, seed.assignment.id, seed.firstChild.id),
    ).toMatchObject({
      childLabel: "孩子1",
    });
  });
  it("does not treat unassigned organization staff as a group reviewer", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "TEXT");
    const member = (
      await seed.harness.repository.query("organizationMembers", {
        accountId: seed.teacher.accountId,
      })
    )[0];
    if (!member) throw new Error("Member missing");
    await seed.harness.repository.transaction(async (tx) => {
      await tx.update("organizationMembers", member.id, { organizationRole: "STAFF" });
      for (const binding of await tx.query("groupRoleBindings", {
        accountId: seed.teacher.accountId,
      })) {
        await tx.update("groupRoleBindings", binding.id, { status: "WITHDRAWN" });
      }
    });
    await expect(seed.submissions.detail(seed.teacher, seed.assignment.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("does not cache private read results in command receipts", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY", "TEXT");
    const api = createCoreApi(seed.harness);
    const command = {
      action: "GET_ASSIGNMENT_DETAIL",
      payload: { assignmentId: seed.assignment.id, childId: seed.firstChild.id },
      requestId: "detail-read-request-0001",
    };
    const receiptsBeforeRead = await seed.harness.repository.query("commandReceipts");
    expect(receiptsBeforeRead.map((receipt) => receipt.action)).toEqual([
      "ISSUE_TEACHER_ACTIVATION",
      "ACTIVATE_TEACHER_WORKSPACE",
      "PUBLISH_FAMILY_TASK",
    ]);
    expect(await api.handle(command, { openId: "wx-scenario-guardian" })).toMatchObject({
      ok: true,
    });
    expect(await seed.harness.repository.query("commandReceipts")).toEqual(receiptsBeforeRead);
  });
  it("returns actual submitted text to the guardian", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY", "TEXT");
    expect(
      await seed.submissions.detail(seed.guardian, seed.assignment.id, seed.firstChild.id),
    ).toMatchObject({
      title: "整理书桌",
      taskState: "SUBMITTED",
      submission: { text: "已经完成", mediaAssetIds: [] },
    });
  });
  it("does not let teachers read unrelated family submissions", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY", "TEXT");
    await expect(seed.submissions.detail(seed.teacher, seed.assignment.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("allows the assigned teacher without exposing private family identifiers", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "TEXT");
    const result = await seed.submissions.detail(seed.teacher, seed.assignment.id);
    expect(result).toMatchObject({ submission: { text: "已经完成" } });
    expect(result).not.toHaveProperty("familyId");
    expect(result).not.toHaveProperty("childId");
  });
});
