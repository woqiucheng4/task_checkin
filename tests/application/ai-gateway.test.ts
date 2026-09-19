import { describe, expect, it } from "vitest";

import { AiGateway } from "../../src/application/ai-gateway.js";
import { MediaService } from "../../src/application/media-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeOcrProvider, FakeVerifiedMediaStorage } from "../helpers/media-fakes.js";

async function sourceScenario() {
  const seed = await createIdentityScenario(1);
  const storage = new FakeVerifiedMediaStorage();
  const media = new MediaService(
    seed.harness,
    storage,
    new FakeOcrProvider({
      confidence: 0.92,
      provider: "fake-draft-provider",
      providerVersion: "1.0",
      title: "识别出的任务",
    }),
  );
  const upload = await media.createUploadIntent(seed.teacher, {
    byteSize: 12,
    mimeType: "image/jpeg",
    ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
    purpose: "TASK_SOURCE",
    requestId: "ai-draft-upload-intent",
    retentionDays: 30,
  });
  await media.uploadContent(seed.teacher, {
    assetId: upload.asset.id,
    base64: Buffer.from([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64"),
    requestId: "ai-draft-upload-recorded",
  });
  return { ...seed, storage, upload };
}

describe("AiGateway", () => {
  it("uses private bytes once, records only a digest, and leaves an editable draft", async () => {
    const seed = await sourceScenario();
    const provider = new FakeOcrProvider({
      category: "mathematics",
      confidence: 0.92,
      provider: "fake-draft-provider",
      providerVersion: "1.0",
      title: "识别出的任务",
    });
    const gateway = new AiGateway(seed.harness, seed.storage, provider);

    const draft = await gateway.generateTaskDraft(seed.teacher, {
      assetId: seed.upload.asset.id,
      requestId: "ai-draft-audited-success",
    });

    expect(draft).toMatchObject({ category: "MATHEMATICS", status: "DRAFT" });
    expect(await seed.harness.repository.query("tasks", { draftId: draft.id })).toHaveLength(0);
    const [invocation] = await seed.harness.repository.query("aiInvocations");
    expect(invocation).toMatchObject({
      assetId: seed.upload.asset.id,
      inputByteSize: 12,
      inputImageCount: 1,
      provider: "fake-draft-provider",
      resultSummary: { recognizedFieldCount: 2 },
    });
    expect(invocation?.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(invocation).not.toHaveProperty("image");
    expect(invocation).not.toHaveProperty("base64");
    expect(invocation).not.toHaveProperty("storageKey");
    expect(provider.calls[0]?.image).toHaveLength(12);
  });

  it("rejects child callers before reading private image bytes", async () => {
    const seed = await sourceScenario();
    const gateway = new AiGateway(seed.harness, seed.storage, new FakeOcrProvider({
      confidence: 0.9,
      provider: "fake",
      providerVersion: "1",
    }));

    await expect(
      gateway.generateTaskDraft(
        { accountId: seed.firstChild.id, childId: seed.firstChild.id, mode: "CHILD" },
        { assetId: seed.upload.asset.id, requestId: "ai-draft-child-denied" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not persist an invocation or draft when the provider fails", async () => {
    const seed = await sourceScenario();
    const gateway = new AiGateway(seed.harness, seed.storage, {
      async generateTaskDraft() {
        throw new Error("provider unavailable");
      },
    });

    await expect(
      gateway.generateTaskDraft(seed.teacher, {
        assetId: seed.upload.asset.id,
        requestId: "ai-draft-provider-failure",
      }),
    ).rejects.toThrow("provider unavailable");
    expect(await seed.harness.repository.query("aiInvocations")).toHaveLength(0);
    expect(await seed.harness.repository.query("taskDrafts")).toHaveLength(0);
    expect(await seed.harness.repository.query("tasks")).toHaveLength(0);
  });

  it("honors the global circuit breaker without changing manual task flows", async () => {
    const seed = await sourceScenario();
    const gateway = new AiGateway(
      seed.harness,
      seed.storage,
      new FakeOcrProvider({ confidence: 0.9, provider: "fake", providerVersion: "1" }),
      { enabled: false },
    );

    await expect(
      gateway.generateTaskDraft(seed.teacher, {
        assetId: seed.upload.asset.id,
        requestId: "ai-draft-disabled",
      }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(await seed.harness.repository.query("taskDrafts")).toHaveLength(0);
    expect(await seed.harness.repository.query("tasks")).toHaveLength(0);
  });
});
