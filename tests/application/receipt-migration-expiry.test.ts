import { describe, expect, it } from "vitest";
import { authorizedReceipt } from "../../src/application/authorized-receipt.js";
import { createCoreApi } from "../../src/application/core-api.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("receipt expiry and legacy publication migration", () => {
  it.each([
    ["2026-09-05T18:00:00+08:00", "2026-09-05T09:59:59.999Z", true],
    ["2026-09-05T18:00:00+08:00", "2026-09-05T10:00:00.000Z", false],
    ["2026-09-05T18:00:00+08:00", "2026-09-05T10:00:00.001Z", false],
    ["2026-09-05T02:00:00-08:00", "2026-09-05T09:59:59.999Z", true],
    ["2026-09-05T02:00:00-08:00", "2026-09-05T10:00:00.000Z", false],
    ["2026-09-05T02:00:00-08:00", "2026-09-05T10:00:00.001Z", false],
    ["not-a-date", "2026-09-05T09:00:00.000Z", false],
  ] as const)("evaluates expiry %s at %s using instants", async (expiresAt, now, allowed) => {
    const seed = await createIdentityScenario(1);
    const invitation = (await seed.harness.repository.query("invitations"))[0];
    if (!invitation) throw new Error("Missing invitation");
    await seed.harness.repository.transaction((tx) =>
      tx.update("invitations", invitation.id, { expiresAt }),
    );
    seed.harness.clock.set("2026-09-05T08:00:00.000Z");
    let executions = 0;
    const replay = () =>
      authorizedReceipt(
        seed.harness,
        seed.teacher,
        "EXPIRY_TEST",
        "expiry-receipt-request",
        {},
        async (repository) => {
          executions += 1;
          await repository.read("invitations", invitation.id);
          return { secret: "current authorized result" };
        },
      );
    await replay();
    seed.harness.clock.set(now);
    if (allowed) await expect(replay()).resolves.toEqual({ secret: "current authorized result" });
    else await expect(replay()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(executions).toBe(1);
  });

  it.each(["FAMILY", "ORGANIZATION"] as const)(
    "blocks a historical random receipt for %s before publishing another task",
    async (source) => {
      const seed = await createSubmittedTaskScenario(source);
      const action = source === "FAMILY" ? "PUBLISH_FAMILY_TASK" : "PUBLISH_GROUP_TASK";
      const requestId = "historical-publication-request";
      const actor = source === "FAMILY" ? seed.guardian : seed.teacher;
      await seed.harness.repository.transaction((tx) =>
        tx.insert("commandReceipts", {
          id: "old-random-receipt-id",
          accountId: actor.accountId,
          action,
          requestId,
          result: { ...seed.task, legacyPrivateValue: "never-return-this" },
          createdAt: seed.harness.clock.now(),
        }),
      );
      const beforeAssignments = await seed.harness.repository.query("taskAssignments");
      const response = await createCoreApi(seed.harness).handle(
        {
          action,
          requestId,
          payload: {
            ...seed.task,
            occurrenceDate: "2026-09-05",
            familyId: seed.family.id,
            childIds: [seed.firstChild.id],
            groupId: seed.group.id,
          },
        },
        { openId: source === "FAMILY" ? "wx-scenario-guardian" : "wx-scenario-teacher" },
      );
      expect(response).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      expect(JSON.stringify(response)).not.toContain("never-return-this");
      expect(await seed.harness.repository.query("tasks")).toHaveLength(1);
      expect(await seed.harness.repository.query("taskAssignments")).toEqual(beforeAssignments);
      expect(
        await seed.harness.repository.query("commandReceipts", {
          accountId: actor.accountId,
          action,
          requestId,
        }),
      ).toHaveLength(1);
    },
  );
});
