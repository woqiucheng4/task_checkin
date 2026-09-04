import { describe, expect, it } from "vitest";
import { CommercialService } from "../../src/application/commercial-service.js";
import { GovernanceService } from "../../src/application/governance-service.js";
import { IdentityService } from "../../src/application/identity-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("governance and commercial validation boundaries", () => {
  it("rejects malformed support grants and export transitions", async () => {
    const seed = await createIdentityScenario(1);
    const governance = new GovernanceService(seed.harness);
    const validGrant = {
      expiresAt: "2026-09-06T10:00:00.000Z",
      purpose: "工单调查",
      requestId: "governance-boundary-grant",
      resourceIds: ["task-1"],
      resourceType: "TASK" as const,
      supportAccountId: "support-1",
      tenantScope: { familyId: seed.family.id, kind: "FAMILY" as const },
      ticketId: "TICKET-1",
    };
    await expect(governance.grantSupportAccess(seed.guardian, validGrant)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      governance.grantSupportAccess(seed.platform, { ...validGrant, ticketId: "" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      governance.grantSupportAccess(seed.platform, { ...validGrant, purpose: "" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      governance.grantSupportAccess(seed.platform, { ...validGrant, resourceIds: [] }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      governance.grantSupportAccess(seed.platform, {
        ...validGrant,
        expiresAt: seed.harness.clock.now(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      governance.revokeSupportAccess(seed.platform, {
        grantId: "missing",
        requestId: "governance-revoke-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      governance.requestExport(seed.guardian, {
        kind: "ORGANIZATION_DATA",
        requestId: "governance-export-mismatch",
        tenantScope: { familyId: seed.family.id, kind: "FAMILY" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      governance.requestExport(seed.teacher, {
        kind: "FAMILY_DATA",
        requestId: "governance-export-forbidden",
        tenantScope: { familyId: seed.family.id, kind: "FAMILY" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      governance.requestExport(seed.guardian, {
        kind: "FAMILY_DATA",
        requestId: "governance-export-provider",
        tenantScope: { contentProviderId: "p", kind: "CONTENT_PROVIDER" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      governance.approveExport(seed.platform, {
        downloadExpiresAt: "2026-09-06T00:00:00.000Z",
        exportRequestId: "missing",
        requestId: "governance-approve-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const request = await governance.requestExport(seed.guardian, {
      kind: "FAMILY_DATA",
      requestId: "governance-export-valid",
      tenantScope: { familyId: seed.family.id, kind: "FAMILY" },
    });
    await expect(
      governance.approveExport(seed.guardian, {
        downloadExpiresAt: "2026-09-06T00:00:00.000Z",
        exportRequestId: request.id,
        requestId: "governance-approve-forbidden",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      governance.approveExport(seed.platform, {
        downloadExpiresAt: seed.harness.clock.now(),
        exportRequestId: request.id,
        requestId: "governance-approve-expired",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects invalid plans, assignments, quota use, and provider identity", async () => {
    const seed = await createIdentityScenario(1);
    const commercial = new CommercialService(seed.harness);
    await expect(
      commercial.definePlan(seed.guardian, {
        audience: "FAMILY",
        entitlements: {},
        name: "家庭版",
        quotas: {},
        requestId: "commercial-plan-forbidden",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      commercial.definePlan(seed.platform, {
        audience: "FAMILY",
        entitlements: {},
        name: "",
        quotas: {},
        requestId: "commercial-plan-empty",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      commercial.definePlan(seed.platform, {
        audience: "FAMILY",
        entitlements: {},
        name: "家庭版",
        quotas: { TASKS: -1 },
        requestId: "commercial-plan-quota-negative",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const plan = await commercial.definePlan(seed.platform, {
      audience: "FAMILY",
      entitlements: { TASKS: true },
      name: "家庭版",
      quotas: { TASKS: 1 },
      requestId: "commercial-plan-valid",
    });
    await expect(
      commercial.assignPlan(seed.platform, {
        planId: "missing",
        requestId: "commercial-assign-missing",
        startsAt: "2026-09-01T00:00:00.000Z",
        tenantScope: { familyId: seed.family.id, kind: "FAMILY" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      commercial.assignPlan(seed.platform, {
        planId: plan.id,
        requestId: "commercial-assign-mismatch",
        startsAt: "2026-09-01T00:00:00.000Z",
        tenantScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      commercial.assignPlan(seed.platform, {
        endsAt: "2026-08-01T00:00:00.000Z",
        planId: plan.id,
        requestId: "commercial-assign-dates",
        startsAt: "2026-09-01T00:00:00.000Z",
        tenantScope: { familyId: seed.family.id, kind: "FAMILY" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await commercial.assignPlan(seed.platform, {
      endsAt: "2026-10-01T00:00:00.000Z",
      planId: plan.id,
      requestId: "commercial-assign-valid",
      startsAt: "2026-09-01T00:00:00.000Z",
      tenantScope: { familyId: seed.family.id, kind: "FAMILY" },
    });
    await expect(
      commercial.consumeQuota(seed.guardian, {
        amount: 0,
        feature: "TASKS",
        period: "2026-09",
        requestId: "commercial-consume-zero",
        tenantScope: { familyId: seed.family.id, kind: "FAMILY" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      commercial.consumeQuota(seed.guardian, {
        amount: 1,
        feature: "EXPORTS",
        period: "2026-09",
        requestId: "commercial-consume-disabled",
        tenantScope: { familyId: seed.family.id, kind: "FAMILY" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      commercial.registerContentProvider(seed.platform, {
        accountId: "missing",
        name: "内容方",
        requestId: "commercial-provider-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const invalidProvider: ActorContext = {
      accountId: seed.guardian.accountId,
      contentProviderId: "missing",
      mode: "CONTENT_PROVIDER",
    };
    await expect(commercial.providerWorkspace(invalidProvider)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      commercial.checkEntitlement(
        seed.guardian,
        { contentProviderId: "p", kind: "CONTENT_PROVIDER" },
        "X",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("covers identity conflict and validation paths", async () => {
    const seed = await createIdentityScenario(1);
    const identity = new IdentityService(seed.harness);
    await expect(
      identity.createAccount({
        openId: "wx-scenario-guardian",
        requestId: "identity-existing-account",
      }),
    ).resolves.toMatchObject({ id: seed.guardian.accountId });
    await expect(
      identity.addChild(seed.guardian, {
        familyId: seed.family.id,
        grade: 0,
        nickname: "孩子",
        requestId: "identity-grade-low",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      identity.addChild(seed.guardian, {
        familyId: seed.family.id,
        grade: 7,
        nickname: "孩子",
        requestId: "identity-grade-high",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      identity.addChild(seed.guardian, {
        familyId: seed.family.id,
        nickname: "",
        requestId: "identity-name-empty",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      identity.createOrganization(seed.guardian, {
        adminAccountId: seed.teacher.accountId,
        name: "机构",
        requestId: "identity-org-forbidden",
        type: "SCHOOL",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      identity.createOrganization(seed.platform, {
        adminAccountId: "missing",
        name: "机构",
        requestId: "identity-org-admin-missing",
        type: "SCHOOL",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      identity.bindGroupRole(seed.teacher, {
        accountId: "missing",
        groupId: seed.group.id,
        requestId: "identity-binding-missing",
        role: "ASSISTANT",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(identity.getOrganizationChild(seed.teacher, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("matches task and submission resources to the exact support tenant scope", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const governance = new GovernanceService(seed.harness);
    const support: ActorContext = { accountId: "support-resource-reader", mode: "PLATFORM" };
    const submissionId = (await seed.harness.repository.query("submissions"))[0]?.id ?? "";
    for (const resource of [
      { id: seed.task.id, type: "TASK" as const },
      { id: submissionId, type: "SUBMISSION" as const },
    ]) {
      await governance.grantSupportAccess(seed.platform, {
        expiresAt: "2026-09-05T10:00:00.000Z",
        purpose: "核对资源归属",
        requestId: `governance-resource-${resource.type}`,
        resourceIds: [resource.id],
        resourceType: resource.type,
        supportAccountId: support.accountId,
        tenantScope: { familyId: seed.family.id, kind: "FAMILY" },
        ticketId: `TICKET-${resource.type}`,
      });
      await expect(
        governance.readWithSupportGrant(support, {
          resourceId: resource.id,
          resourceType: resource.type,
        }),
      ).resolves.toMatchObject({ id: resource.id });
    }
    await governance.grantSupportAccess(seed.platform, {
      expiresAt: "2026-09-05T10:00:00.000Z",
      purpose: "错误范围验证",
      requestId: "governance-resource-wrong-scope",
      resourceIds: [seed.task.id],
      resourceType: "TASK",
      supportAccountId: "support-wrong-scope",
      tenantScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      ticketId: "TICKET-WRONG-SCOPE",
    });
    await expect(
      governance.readWithSupportGrant(
        { accountId: "support-wrong-scope", mode: "PLATFORM" },
        {
          resourceId: seed.task.id,
          resourceType: "TASK",
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      governance.requestExport(seed.teacher, {
        kind: "ORGANIZATION_DATA",
        requestId: "governance-org-export-valid",
        tenantScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      }),
    ).resolves.toMatchObject({ status: "PENDING" });
  });
});
