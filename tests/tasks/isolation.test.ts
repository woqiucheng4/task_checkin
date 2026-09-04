import { describe, expect, it } from "vitest";

import { TaskService } from "../../src/application/task-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

describe("task tenant isolation", () => {
  it("rejects a teacher publishing into another organization group", async () => {
    const first = await createIdentityScenario(1);
    const outsiderAccount = await first.identity.createAccount({
      openId: "wx-outsider-publisher",
      requestId: "outsider-account-publisher",
    });
    const outsider: ActorContext = { accountId: outsiderAccount.id, mode: "ACCOUNT" };
    await first.identity.createOrganization(first.platform, {
      adminAccountId: outsider.accountId,
      name: "远山学校",
      requestId: "outsider-organization",
      type: "SCHOOL",
    });
    const tasks = new TaskService(first.harness);

    await expect(
      tasks.publishGroupTask(outsider, {
        allowLateSubmission: true,
        category: "LANGUAGE",
        dueAt: "2026-09-05T13:00:00.000Z",
        estimatedMinutes: 15,
        groupId: first.group.id,
        importance: "REQUIRED",
        occurrenceDate: "2026-09-05",
        requestId: "cross-org-publish",
        requiresAcademicReview: true,
        schedule: { kind: "ONCE", date: "2026-09-05" },
        startsAt: "2026-09-05T10:00:00.000Z",
        submissionMode: "CONFIRM",
        title: "朗读课文",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
