import { describe, expect, it } from "vitest";
import type { ProviderWorkspace } from "../../src/application/commercial-service.js";
import type {
  ContentProvider,
  Plan,
  SupportAccessGrant,
  Task,
  TaskAssignment,
  TenantEntitlement,
  UsageCounter,
} from "../../src/domain/model.js";
import { AcceptanceScenario, ORDINARY_TASK } from "./scenario.js";

describe("commercial and support boundaries acceptance", () => {
  it("AC-GOV-001 requires an exact, audited, unexpired support grant", async () => {
    const scenario = new AcceptanceScenario();
    const family = await scenario.createFamilyWithChild();
    const platformOpenId = "wx-governance-platform";
    const supportOpenId = "wx-governance-support";
    await scenario.bootstrap(platformOpenId);
    const supportAccount = await scenario.bootstrap(supportOpenId);
    const task = await scenario.call<Task>(family.openId, "PUBLISH_FAMILY_TASK", {
      ...ORDINARY_TASK,
      childIds: [family.child.id],
      familyId: family.family.id,
    });
    const assignment = (
      await scenario.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0] as TaskAssignment;
    const supportOptions = { actor: { mode: "PLATFORM" as const }, platform: true };

    expect(
      await scenario.result(
        supportOpenId,
        "READ_WITH_SUPPORT_GRANT",
        { resourceId: assignment.id, resourceType: "TASK_ASSIGNMENT" },
        supportOptions,
      ),
    ).toMatchObject({ error: { code: "SUPPORT_GRANT_REQUIRED" }, ok: false });

    await scenario.call<SupportAccessGrant>(
      platformOpenId,
      "GRANT_SUPPORT_ACCESS",
      {
        expiresAt: "2026-09-05T11:00:00.000Z",
        purpose: "处理家庭工单",
        resourceIds: [assignment.id],
        resourceType: "TASK_ASSIGNMENT",
        supportAccountId: supportAccount.id,
        tenantScope: { familyId: family.family.id, kind: "FAMILY" },
        ticketId: "TICKET-AC-001",
      },
      supportOptions,
    );
    await expect(
      scenario.call(
        supportOpenId,
        "READ_WITH_SUPPORT_GRANT",
        { resourceId: assignment.id, resourceType: "TASK_ASSIGNMENT" },
        supportOptions,
      ),
    ).resolves.toMatchObject({ id: assignment.id });
    await expect(
      scenario.harness.repository.query("auditLogs", { action: "SUPPORT_CONTENT_READ" }),
    ).resolves.toHaveLength(1);

    scenario.harness.clock.set("2026-09-05T12:00:00.000Z");
    expect(
      await scenario.result(
        supportOpenId,
        "READ_WITH_SUPPORT_GRANT",
        { resourceId: assignment.id, resourceType: "TASK_ASSIGNMENT" },
        supportOptions,
      ),
    ).toMatchObject({ error: { code: "SUPPORT_GRANT_REQUIRED" }, ok: false });
  });

  it("AC-COMM-001 enforces replay-safe quotas and isolates content-provider data", async () => {
    const scenario = new AcceptanceScenario();
    const institution = await scenario.createInstitution();
    const platformOptions = { actor: { mode: "PLATFORM" as const }, platform: true };
    const plan = await scenario.call<Plan>(
      institution.platformOpenId,
      "DEFINE_PLAN",
      {
        audience: "ORGANIZATION",
        entitlements: { EXPORTS: true, GROUPS: true },
        name: "机构基础版",
        quotas: { GROUPS: 2 },
      },
      platformOptions,
    );
    await scenario.call<TenantEntitlement>(
      institution.platformOpenId,
      "ASSIGN_PLAN",
      {
        planId: plan.id,
        startsAt: "2026-09-01T00:00:00.000Z",
        tenantScope: { kind: "ORGANIZATION", organizationId: institution.organization.id },
      },
      platformOptions,
    );
    const quotaPayload = {
      amount: 1,
      feature: "GROUPS",
      period: "2026-09",
      tenantScope: { kind: "ORGANIZATION", organizationId: institution.organization.id },
    } as const;
    const first = await scenario.call<UsageCounter>(
      institution.teacherOpenId,
      "CONSUME_QUOTA",
      quotaPayload,
      { requestId: "acceptance-quota-replay-001" },
    );
    const replay = await scenario.call<UsageCounter>(
      institution.teacherOpenId,
      "CONSUME_QUOTA",
      quotaPayload,
      { requestId: "acceptance-quota-replay-001" },
    );
    expect(replay).toEqual(first);
    expect(replay.used).toBe(1);
    await scenario.call(institution.teacherOpenId, "CONSUME_QUOTA", quotaPayload);
    expect(
      await scenario.result(institution.teacherOpenId, "CONSUME_QUOTA", quotaPayload),
    ).toMatchObject({ error: { code: "QUOTA_EXCEEDED" }, ok: false });

    const providerOpenId = "wx-acceptance-provider";
    const providerAccount = await scenario.bootstrap(providerOpenId);
    const provider = await scenario.call<ContentProvider>(
      institution.platformOpenId,
      "REGISTER_CONTENT_PROVIDER",
      {
        accountId: providerAccount.id,
        name: "启明星内容",
        settlementAccountRef: "settlement-001",
      },
      platformOptions,
    );
    const providerActor = { contentProviderId: provider.id, mode: "CONTENT_PROVIDER" as const };
    await scenario.call(
      providerOpenId,
      "PUBLISH_PROVIDER_TEMPLATE",
      {
        allowLateSubmission: true,
        category: "SCIENCE",
        estimatedMinutes: 15,
        importance: "CHALLENGE",
        requiresAcademicReview: false,
        schedule: { kind: "DAILY", startDate: "2026-09-01" },
        submissionMode: "CONFIRM",
        title: "观察一片叶子",
      },
      { actor: providerActor },
    );
    const workspace = await scenario.call<ProviderWorkspace>(
      providerOpenId,
      "GET_PROVIDER_WORKSPACE",
      {},
      { actor: providerActor },
    );
    expect(workspace).toMatchObject({
      settlement: { accountRef: "settlement-001" },
      templates: [{ title: "观察一片叶子" }],
    });
    expect(JSON.stringify(workspace)).not.toMatch(
      /"(?:childId|submissionId|wishId|guardianId|familyId)"/i,
    );
  });
});
