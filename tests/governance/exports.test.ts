import { describe, expect, it } from "vitest";

import { GovernanceService } from "../../src/application/governance-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

describe("data export approval", () => {
  it("creates a family export request and requires platform approval before download", async () => {
    const seed = await createIdentityScenario(1);
    const governance = new GovernanceService(seed.harness);

    const request = await governance.requestExport(seed.guardian, {
      kind: "FAMILY_DATA",
      requestId: "export-family-request",
      tenantScope: { kind: "FAMILY", familyId: seed.family.id },
    });
    expect(request.status).toBe("PENDING");

    const approved = await governance.approveExport(seed.platform, {
      downloadExpiresAt: "2026-09-06T10:00:00.000Z",
      exportRequestId: request.id,
      requestId: "export-family-approve",
    });
    expect(approved).toMatchObject({
      approvedByAccountId: seed.platform.accountId,
      status: "APPROVED",
    });
  });

  it("rejects a family export requested by an organization administrator", async () => {
    const seed = await createIdentityScenario(1);
    const governance = new GovernanceService(seed.harness);

    await expect(
      governance.requestExport(seed.teacher, {
        kind: "FAMILY_DATA",
        requestId: "export-family-forbidden",
        tenantScope: { kind: "FAMILY", familyId: seed.family.id },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
