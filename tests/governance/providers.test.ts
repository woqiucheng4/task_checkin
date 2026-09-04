import { describe, expect, it } from "vitest";

import { CommercialService } from "../../src/application/commercial-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

describe("content provider isolation", () => {
  it("exposes only provider templates and settlement metadata", async () => {
    const seed = await createIdentityScenario(1);
    const commercial = new CommercialService(seed.harness);
    const providerAccount = await seed.identity.createAccount({
      openId: "wx-content-provider",
      requestId: "provider-account-create",
    });
    const provider = await commercial.registerContentProvider(seed.platform, {
      accountId: providerAccount.id,
      name: "启明星内容",
      requestId: "provider-register",
      settlementAccountRef: "settlement-001",
    });
    const providerActor: ActorContext = {
      accountId: providerAccount.id,
      contentProviderId: provider.id,
      mode: "CONTENT_PROVIDER",
    };
    await commercial.publishProviderTemplate(providerActor, {
      allowLateSubmission: true,
      category: "SCIENCE",
      estimatedMinutes: 15,
      importance: "CHALLENGE",
      requestId: "provider-template-publish",
      requiresAcademicReview: false,
      schedule: { kind: "DAILY", startDate: "2026-09-01" },
      submissionMode: "CONFIRM",
      title: "观察一片叶子",
    });

    const view = await commercial.providerWorkspace(providerActor);

    expect(view).toMatchObject({
      settlement: { accountRef: "settlement-001" },
      templates: [{ title: "观察一片叶子" }],
    });
    expect(JSON.stringify(view)).not.toMatch(
      /"(?:childId|submissionId|wishId|guardianId|familyId)"/i,
    );
  });

  it("rejects a provider actor using another provider id", async () => {
    const seed = await createIdentityScenario(1);
    const commercial = new CommercialService(seed.harness);
    const actor: ActorContext = {
      accountId: seed.guardian.accountId,
      contentProviderId: "provider-does-not-exist",
      mode: "CONTENT_PROVIDER",
    };

    await expect(commercial.providerWorkspace(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
