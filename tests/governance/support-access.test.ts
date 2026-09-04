import { describe, expect, it } from "vitest";

import { GovernanceService } from "../../src/application/governance-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("support access grants", () => {
  it("denies platform support access to child content by default", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const governance = new GovernanceService(seed.harness);
    const support: ActorContext = { accountId: "support-agent", mode: "PLATFORM" };

    await expect(
      governance.readWithSupportGrant(support, {
        resourceId: seed.assignment.id,
        resourceType: "TASK_ASSIGNMENT",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_GRANT_REQUIRED" });
  });

  it("allows only approved unexpired scoped access and audits the read", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const governance = new GovernanceService(seed.harness);
    const support: ActorContext = { accountId: "support-agent", mode: "PLATFORM" };
    const grant = await governance.grantSupportAccess(seed.platform, {
      expiresAt: "2026-09-05T10:00:00.000Z",
      purpose: "调查用户工单",
      requestId: "support-grant-create",
      resourceIds: [seed.assignment.id],
      resourceType: "TASK_ASSIGNMENT",
      supportAccountId: support.accountId,
      tenantScope: { kind: "FAMILY", familyId: seed.family.id },
      ticketId: "TICKET-1001",
    });

    const content = await governance.readWithSupportGrant(support, {
      resourceId: seed.assignment.id,
      resourceType: "TASK_ASSIGNMENT",
    });

    expect(content).toMatchObject({ id: seed.assignment.id });
    expect(
      await seed.harness.repository.query("auditLogs", { action: "SUPPORT_CONTENT_READ" }),
    ).toHaveLength(1);
    await governance.revokeSupportAccess(seed.platform, {
      grantId: grant.id,
      requestId: "support-grant-revoke",
    });
    await expect(
      governance.readWithSupportGrant(support, {
        resourceId: seed.assignment.id,
        resourceType: "TASK_ASSIGNMENT",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_GRANT_REQUIRED" });
  });

  it("rejects an expired support grant", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const governance = new GovernanceService(seed.harness);
    const support: ActorContext = { accountId: "support-expired", mode: "PLATFORM" };
    await governance.grantSupportAccess(seed.platform, {
      expiresAt: "2026-09-05T09:01:00.000Z",
      purpose: "调查用户工单",
      requestId: "support-expiring-grant",
      resourceIds: [seed.assignment.id],
      resourceType: "TASK_ASSIGNMENT",
      supportAccountId: support.accountId,
      tenantScope: { kind: "FAMILY", familyId: seed.family.id },
      ticketId: "TICKET-1002",
    });
    seed.harness.clock.set("2026-09-05T09:02:00.000Z");

    await expect(
      governance.readWithSupportGrant(support, {
        resourceId: seed.assignment.id,
        resourceType: "TASK_ASSIGNMENT",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_GRANT_REQUIRED" });
  });
});
