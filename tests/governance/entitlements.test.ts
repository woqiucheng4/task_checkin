import { describe, expect, it } from "vitest";

import { CommercialService } from "../../src/application/commercial-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

describe("tenant entitlements and quotas", () => {
  it("blocks usage after the organization plan quota is exhausted", async () => {
    const seed = await createIdentityScenario(1);
    const commercial = new CommercialService(seed.harness);
    const plan = await commercial.definePlan(seed.platform, {
      audience: "ORGANIZATION",
      entitlements: { GROUPS: true, EXPORTS: true },
      name: "机构基础版",
      quotas: { GROUPS: 2 },
      requestId: "plan-define-org",
    });
    const scope = { kind: "ORGANIZATION" as const, organizationId: seed.organization.id };
    await commercial.assignPlan(seed.platform, {
      planId: plan.id,
      requestId: "plan-assign-org",
      startsAt: "2026-09-01T00:00:00.000Z",
      tenantScope: scope,
    });

    await commercial.consumeQuota(seed.teacher, {
      amount: 2,
      feature: "GROUPS",
      period: "2026-09",
      requestId: "quota-consume-org",
      tenantScope: scope,
    });

    await expect(
      commercial.consumeQuota(seed.teacher, {
        amount: 1,
        feature: "GROUPS",
        period: "2026-09",
        requestId: "quota-exceed-org",
        tenantScope: scope,
      }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    await expect(commercial.checkEntitlement(seed.teacher, scope, "EXPORTS")).resolves.toBe(true);
  });
});
