import { expect, it } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

it("lists only active templates of the authorized group's organization without caching private reads", async () => {
  const seed = await createSubmittedTaskScenario("ORGANIZATION");
  const template = await seed.tasks.createTemplate(seed.teacher, {
    ...seed.task,
    organizationId: seed.organization.id,
    occurrenceDate: "2026-09-05",
    requestId: "template-list-create-0001",
  });
  await seed.harness.repository.transaction(async (tx) => {
    await tx.insert("taskTemplates", { ...template, id: "template-archived", status: "ARCHIVED" });
    await tx.insert("taskTemplates", {
      ...template,
      id: "template-foreign",
      ownerScope: { kind: "ORGANIZATION", organizationId: "foreign-org" },
    });
    await tx.insert("taskTemplates", {
      ...template,
      id: "template-private-family",
      ownerScope: { kind: "FAMILY", familyId: seed.family.id },
    });
  });
  const api = createCoreApi(seed.harness);
  const request = {
    action: "GET_GROUP_TASK_TEMPLATES",
    payload: { groupId: seed.group.id },
    requestId: "template-read-0001",
  };
  const receiptsBeforeRead = await seed.harness.repository.query("commandReceipts");
  expect(receiptsBeforeRead.map((receipt) => receipt.action)).toEqual([
    "ISSUE_TEACHER_ACTIVATION",
    "ACTIVATE_TEACHER_WORKSPACE",
    "PUBLISH_GROUP_TASK",
  ]);
  const result = await api.handle(request, { openId: "wx-scenario-teacher" });
  expect(result).toMatchObject({
    ok: true,
    data: [{ id: template.id, title: "整理书桌", category: "LIFE", submissionMode: "CONFIRM" }],
  });
  if (!result.ok) throw new Error("Expected successful read");
  expect(result.data).toHaveLength(1);
  expect((result.data as object[])[0]).not.toHaveProperty("ownerScope");
  expect(await seed.harness.repository.query("commandReceipts")).toEqual(receiptsBeforeRead);
  expect(await api.handle(request, { openId: "wx-scenario-guardian" })).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
  await seed.harness.repository.transaction((tx) =>
    tx.update("groups", seed.group.id, { status: "INACTIVE" }),
  );
  expect(await api.handle(request, { openId: "wx-scenario-teacher" })).toMatchObject({ ok: false });
});
