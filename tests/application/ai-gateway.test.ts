import { describe, expect, it, vi } from "vitest";

import { AiGateway } from "../../src/application/ai-gateway.js";
import { createCoreApi } from "../../src/application/core-api.js";
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
      submissionMode: "photo",
      title: "识别出的任务",
    }),
  );
  const upload = await media.createUploadIntent(seed.teacher, {
    byteSize: 12,
    mimeType: "image/jpeg",
    ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
    purpose: "TASK_SOURCE",
    requestId: "ai-draft-upload-intent",
    retentionDays: 90,
  });
  await media.uploadContent(seed.teacher, {
    assetId: upload.asset.id,
    base64: Buffer.from([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64"),
    requestId: "ai-draft-upload-recorded",
  });
  return { ...seed, storage, upload };
}

describe("AiGateway", () => {
  it("reauthorizes API retries and rejects a different nonexistent asset for the same request", async () => {
    const seed = await sourceScenario();
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const api = createCoreApi({
      ...seed.harness,
      mediaStorage: seed.storage,
      taskDraftProvider: provider,
    });
    const command = {
      action: "RECOGNIZE_TASK_DRAFT",
      requestId: "api-retry-different-asset",
      payload: { assetId: seed.upload.asset.id },
    };
    expect(await api.handle(command, { openId: "wx-scenario-teacher" })).toMatchObject({
      ok: true,
    });
    const retry = await api.handle(
      { ...command, payload: { assetId: "nonexistent-asset" } },
      { openId: "wx-scenario-teacher" },
    );
    expect(retry).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(retry).not.toHaveProperty("data");
    expect(provider.calls).toHaveLength(1);
  });

  it.each(["membership", "binding"])(
    "does not return a cached draft after the publisher's %s is withdrawn",
    async (authority) => {
      const seed = await sourceScenario();
      let actor = seed.teacher;
      let openId = "wx-scenario-teacher";
      let assetId = seed.upload.asset.id;
      if (authority === "binding") {
        openId = "wx-api-retry-bound-teacher";
        const account = await seed.identity.createAccount({
          openId,
          requestId: "api-retry-bound-account",
        });
        actor = { accountId: account.id, mode: "ACCOUNT" };
        await seed.identity.bindGroupRole(seed.teacher, {
          accountId: actor.accountId,
          groupId: seed.group.id,
          role: "TEACHER",
          requestId: "api-retry-teacher-binding",
        });
        const source = await seed.harness.repository.read("mediaAssets", assetId);
        if (!source) throw new Error("source missing");
        assetId = "bound-teacher-source";
        await seed.harness.repository.transaction((tx) =>
          tx.insert("mediaAssets", { ...source, id: assetId, uploaderAccountId: actor.accountId }),
        );
      }
      const provider = new FakeOcrProvider({
        confidence: 1,
        provider: "fake",
        providerVersion: "1",
        title: "private-draft-title",
      });
      const api = createCoreApi({
        ...seed.harness,
        mediaStorage: seed.storage,
        taskDraftProvider: provider,
      });
      const command = {
        action: "RECOGNIZE_TASK_DRAFT",
        requestId: "api-retry-withdrawn-publisher",
        payload: { assetId },
      };
      expect(await api.handle(command, { openId })).toMatchObject({ ok: true });
      await seed.harness.repository.transaction(async (tx) => {
        if (authority === "membership")
          for (const member of await tx.query("organizationMembers", {
            accountId: actor.accountId,
          })) {
            await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
          }
        if (authority === "binding")
          for (const binding of await tx.query("groupRoleBindings", {
            accountId: actor.accountId,
          })) {
            await tx.update("groupRoleBindings", binding.id, { status: "WITHDRAWN" });
          }
      });
      // Withdraw exactly one authority; the other remains ACTIVE to catch fallback bypasses.
      expect(
        await seed.harness.repository.query(
          authority === "membership" ? "groupRoleBindings" : "organizationMembers",
          { accountId: actor.accountId, status: "ACTIVE" },
        ),
      ).toHaveLength(1);
      const retry = await api.handle(command, { openId });
      expect(retry).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(retry).not.toHaveProperty("data");
      expect(JSON.stringify(retry)).not.toContain("private-draft-title");
      expect(
        await api.handle({ ...command, requestId: "api-new-after-withdrawal" }, { openId }),
      ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(provider.calls).toHaveLength(1);
      expect(
        (await seed.harness.repository.query("usageCounters")).map((counter) => counter.used),
      ).toEqual([1, 1]);
    },
  );

  it("rejects a residual binding when organization membership is not an adult", async () => {
    const seed = await sourceScenario();
    await seed.harness.repository.transaction(async (tx) => {
      for (const member of await tx.query("organizationMembers", {
        accountId: seed.teacher.accountId,
      })) {
        await tx.update("organizationMembers", member.id, { memberType: "CHILD" });
      }
    });
    expect(
      await seed.harness.repository.query("groupRoleBindings", {
        accountId: seed.teacher.accountId,
        status: "ACTIVE",
      }),
    ).toHaveLength(1);
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const gateway = new AiGateway(seed.harness, seed.storage, provider);
    await expect(
      gateway.generateTaskDraft(seed.teacher, {
        assetId: seed.upload.asset.id,
        requestId: "non-adult-membership-request",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(provider.calls).toHaveLength(0);
    expect(await seed.harness.repository.query("usageCounters")).toHaveLength(0);
  });

  it("allows an active adult staff member with an active assistant binding", async () => {
    const seed = await sourceScenario();
    await seed.harness.repository.transaction(async (tx) => {
      for (const member of await tx.query("organizationMembers", {
        accountId: seed.teacher.accountId,
      })) {
        await tx.update("organizationMembers", member.id, { organizationRole: "STAFF" });
      }
      for (const binding of await tx.query("groupRoleBindings", {
        accountId: seed.teacher.accountId,
      })) {
        await tx.update("groupRoleBindings", binding.id, { role: "ASSISTANT" });
      }
    });
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const gateway = new AiGateway(seed.harness, seed.storage, provider);
    await expect(
      gateway.generateTaskDraft(seed.teacher, {
        assetId: seed.upload.asset.id,
        requestId: "active-assistant-request",
      }),
    ).resolves.toMatchObject({ status: "DRAFT" });
    expect(provider.calls).toHaveLength(1);
  });

  it("owns successful API retry idempotency without writing generic command receipts", async () => {
    const seed = await sourceScenario();
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const api = createCoreApi({
      ...seed.harness,
      mediaStorage: seed.storage,
      taskDraftProvider: provider,
    });
    const command = {
      action: "RECOGNIZE_TASK_DRAFT",
      requestId: "api-retry-original-source",
      payload: { assetId: seed.upload.asset.id },
    };
    const first = await api.handle(command, { openId: "wx-scenario-teacher" });
    expect(first).toMatchObject({ ok: true });
    expect(await api.handle(command, { openId: "wx-scenario-teacher" })).toEqual(first);
    expect(provider.calls).toHaveLength(1);
    expect(
      (await seed.harness.repository.query("usageCounters")).map((counter) => counter.used),
    ).toEqual([1, 1]);
    expect(
      await seed.harness.repository.query("commandReceipts", { action: "RECOGNIZE_TASK_DRAFT" }),
    ).toHaveLength(0);
  });

  it("ignores legacy generic success receipts when recognizing a task draft", async () => {
    const seed = await sourceScenario();
    const requestId = "api-ignore-legacy-receipt";
    await seed.harness.repository.transaction((tx) =>
      tx.insert("commandReceipts", {
        id: "legacy-recognition-receipt",
        accountId: seed.teacher.accountId,
        action: "RECOGNIZE_TASK_DRAFT",
        requestId,
        createdAt: seed.harness.clock.now(),
        result: { id: "legacy-private-draft" },
      }),
    );
    const provider = new FakeOcrProvider({
      confidence: 1,
      provider: "fake",
      providerVersion: "1",
      title: "fresh-authorized-draft",
    });
    const api = createCoreApi({
      ...seed.harness,
      mediaStorage: seed.storage,
      taskDraftProvider: provider,
    });
    const result = await api.handle(
      { action: "RECOGNIZE_TASK_DRAFT", requestId, payload: { assetId: seed.upload.asset.id } },
      { openId: "wx-scenario-teacher" },
    );
    expect(result).toMatchObject({ ok: true, data: { title: "fresh-authorized-draft" } });
    expect(provider.calls).toHaveLength(1);
    expect(
      await seed.harness.repository.query("commandReceipts", { action: "RECOGNIZE_TASK_DRAFT" }),
    ).toHaveLength(1);
  });

  it("uses private bytes once, records only a digest, and leaves an editable draft", async () => {
    const seed = await sourceScenario();
    const provider = new FakeOcrProvider({
      category: "mathematics",
      confidence: 0.92,
      provider: "fake-draft-provider",
      providerVersion: "1.0",
      submissionMode: "photo",
      title: "识别出的任务",
    });
    const gateway = new AiGateway(seed.harness, seed.storage, provider);

    const draft = await gateway.generateTaskDraft(seed.teacher, {
      assetId: seed.upload.asset.id,
      requestId: "ai-draft-audited-success",
    });

    expect(draft).toMatchObject({
      category: "MATHEMATICS",
      status: "DRAFT",
      submissionMode: "PHOTO",
    });
    expect(await seed.harness.repository.query("tasks", { draftId: draft.id })).toHaveLength(0);
    const [invocation] = await seed.harness.repository.query("aiInvocations", {
      status: "SUCCEEDED",
    });
    expect(invocation).toMatchObject({
      assetId: seed.upload.asset.id,
      inputByteSize: 12,
      inputImageCount: 1,
      provider: "fake-draft-provider",
      resultSummary: { recognizedFieldCount: 3 },
    });
    expect(invocation?.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(invocation).not.toHaveProperty("image");
    expect(invocation).not.toHaveProperty("base64");
    expect(invocation).not.toHaveProperty("storageKey");
    expect(provider.calls[0]?.image).toHaveLength(12);
  });

  it("rejects child callers before reading private image bytes", async () => {
    const seed = await sourceScenario();
    const gateway = new AiGateway(
      seed.harness,
      seed.storage,
      new FakeOcrProvider({
        confidence: 0.9,
        provider: "fake",
        providerVersion: "1",
      }),
    );

    await expect(
      gateway.generateTaskDraft(
        {
          accountId: seed.firstChild.id,
          childId: seed.firstChild.id,
          mode: "CHILD",
        } as unknown as import("../../src/domain/model.js").ActorContext,
        { assetId: seed.upload.asset.id, requestId: "ai-draft-child-denied" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a different teacher's source image before reading or invoking the provider", async () => {
    const seed = await sourceScenario();
    const secondTeacher = await seed.identity.createAccount({
      openId: "wx-ai-gateway-second-teacher",
      requestId: "ai-gateway-second-teacher-account",
    });
    await seed.identity.bindGroupRole(seed.teacher, {
      accountId: secondTeacher.id,
      groupId: seed.group.id,
      requestId: "ai-gateway-second-teacher-bind",
      role: "TEACHER",
    });
    const media = new MediaService(
      seed.harness,
      seed.storage,
      new FakeOcrProvider({
        confidence: 0.9,
        provider: "unused",
        providerVersion: "1",
      }),
    );
    const upload = await media.createUploadIntent(
      { accountId: secondTeacher.id, mode: "ACCOUNT" },
      {
        byteSize: 12,
        mimeType: "image/jpeg",
        ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
        purpose: "TASK_SOURCE",
        requestId: "ai-gateway-other-source-intent",
        retentionDays: 90,
      },
    );
    await media.uploadContent(
      { accountId: secondTeacher.id, mode: "ACCOUNT" },
      {
        assetId: upload.asset.id,
        base64: Buffer.from([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64"),
        requestId: "ai-gateway-other-source-upload",
      },
    );
    const provider = new FakeOcrProvider({
      confidence: 0.9,
      provider: "fake",
      providerVersion: "1",
    });
    const read = vi.spyOn(seed.storage, "read");
    const gateway = new AiGateway(seed.harness, seed.storage, provider);

    await expect(
      gateway.generateTaskDraft(seed.teacher, {
        assetId: upload.asset.id,
        requestId: "ai-gateway-other-source-denied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).not.toHaveBeenCalled();
    expect(provider.calls).toHaveLength(0);
  });

  it("rejects unbound staff's own source image before reading or invoking the provider", async () => {
    const seed = await sourceScenario();
    const staff = await seed.identity.createAccount({
      openId: "wx-ai-gateway-unbound-staff",
      requestId: "ai-gateway-unbound-staff-account",
    });
    const now = seed.harness.clock.now();
    await seed.harness.repository.transaction((tx) =>
      tx.insert("organizationMembers", {
        accountId: staff.id,
        createdAt: now,
        displayName: "unbound-staff",
        id: "ai-gateway-unbound-staff-membership",
        memberType: "ADULT",
        organizationId: seed.organization.id,
        organizationMemberId: "ai-gateway-unbound-staff-person",
        organizationRole: "ORGANIZATION_ADMIN",
        status: "ACTIVE",
        updatedAt: now,
      }),
    );
    const actor = { accountId: staff.id, mode: "ACCOUNT" } as const;
    const media = new MediaService(
      seed.harness,
      seed.storage,
      new FakeOcrProvider({
        confidence: 0.9,
        provider: "unused",
        providerVersion: "1",
      }),
    );
    const upload = await media.createUploadIntent(actor, {
      byteSize: 12,
      mimeType: "image/jpeg",
      ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      purpose: "TASK_SOURCE",
      requestId: "ai-gateway-staff-source-intent",
      retentionDays: 90,
    });
    await media.uploadContent(actor, {
      assetId: upload.asset.id,
      base64: Buffer.from([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64"),
      requestId: "ai-gateway-staff-source-upload",
    });
    // The upload was authorized; revoke publishing authority before AI access.
    await seed.harness.repository.transaction((tx) =>
      tx.update("organizationMembers", "ai-gateway-unbound-staff-membership", {
        organizationRole: "STAFF",
      }),
    );
    const provider = new FakeOcrProvider({
      confidence: 0.9,
      provider: "fake",
      providerVersion: "1",
    });
    const read = vi.spyOn(seed.storage, "read");
    const gateway = new AiGateway(seed.harness, seed.storage, provider);

    await expect(
      gateway.generateTaskDraft(actor, {
        assetId: upload.asset.id,
        requestId: "ai-gateway-staff-source-denied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).not.toHaveBeenCalled();
    expect(provider.calls).toHaveLength(0);
  });

  it("persists a sanitized failed invocation without a draft when the provider fails", async () => {
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
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const invocations = await seed.harness.repository.query("aiInvocations");
    expect(invocations).toHaveLength(2);
    expect(invocations[1]).toMatchObject({ status: "FAILED", errorCategory: "PROVIDER_FAILURE" });
    expect(JSON.stringify(invocations)).not.toContain("provider unavailable");
    expect(await seed.harness.repository.query("taskDrafts")).toHaveLength(0);
    expect(await seed.harness.repository.query("tasks")).toHaveLength(0);
  });

  it("reserves per-account quota atomically across concurrent gateway instances", async () => {
    const seed = await sourceScenario();
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        new AiGateway(seed.harness, seed.storage, provider, {
          globalDailyLimit: 10,
          accountDailyLimit: 2,
        }).generateTaskDraft(seed.teacher, {
          assetId: seed.upload.asset.id,
          requestId: `concurrent-budget-${i}`,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(provider.calls).toHaveLength(2);
    expect(
      results
        .filter((result) => result.status === "rejected")
        .every((result) => result.status === "rejected" && result.reason.code === "QUOTA_EXCEEDED"),
    ).toBe(true);
    expect(
      (await seed.harness.repository.query("usageCounters")).map((counter) => counter.used),
    ).toEqual([2, 2]);
  });

  it("returns the same draft on retry and charges a request only once", async () => {
    const seed = await sourceScenario();
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const gateway = new AiGateway(seed.harness, seed.storage, provider, {
      globalDailyLimit: 1,
      accountDailyLimit: 1,
    });
    const input = { assetId: seed.upload.asset.id, requestId: "idempotent-budget-request" };
    const draft = await gateway.generateTaskDraft(seed.teacher, input);
    expect(await gateway.generateTaskDraft(seed.teacher, input)).toEqual(draft);
    expect(provider.calls).toHaveLength(1);
    expect(
      (await seed.harness.repository.query("usageCounters")).map((counter) => counter.used),
    ).toEqual([1, 1]);
  });

  it("enforces the global cap across different authorized adult publishers", async () => {
    const seed = await sourceScenario();
    const asset = await seed.harness.repository.read("mediaAssets", seed.upload.asset.id);
    if (!asset) throw new Error("source missing");
    await seed.harness.repository.transaction((tx) =>
      tx.insert("mediaAssets", {
        ...asset,
        id: "family-source",
        ownerScope: { kind: "FAMILY", familyId: seed.family.id },
        uploaderAccountId: seed.guardian.accountId,
      }),
    );
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const gateway = new AiGateway(seed.harness, seed.storage, provider, {
      globalDailyLimit: 1,
      accountDailyLimit: 5,
    });
    const results = await Promise.allSettled([
      gateway.generateTaskDraft(seed.teacher, {
        assetId: asset.id,
        requestId: "global-teacher-request",
      }),
      gateway.generateTaskDraft(seed.guardian, {
        assetId: "family-source",
        requestId: "global-parent-request",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ code: "QUOTA_EXCEEDED" }) }),
    ]);
    expect(provider.calls).toHaveLength(1);
    expect(
      (await seed.harness.repository.query("usageCounters")).map((counter) => counter.used),
    ).toEqual([1, 1]);
  });

  it("passes a zero call budget through the public API dependency injection before private reads", async () => {
    const seed = await sourceScenario();
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const read = vi.spyOn(seed.storage, "read");
    const api = createCoreApi({
      ...seed.harness,
      mediaStorage: seed.storage,
      taskDraftProvider: provider,
      aiTaskDraftGlobalDailyLimit: 0,
      aiTaskDraftAccountDailyLimit: 3,
    });
    const result = await api.handle(
      {
        action: "RECOGNIZE_TASK_DRAFT",
        requestId: "zero-budget-command",
        payload: { assetId: seed.upload.asset.id },
      },
      { openId: "wx-scenario-teacher" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "QUOTA_EXCEEDED" } });
    expect(provider.calls).toHaveLength(0);
    expect(read).not.toHaveBeenCalled();
  });

  it("binds an idempotency key to the original asset without extra spending", async () => {
    const seed = await sourceScenario();
    const asset = await seed.harness.repository.read("mediaAssets", seed.upload.asset.id);
    if (!asset) throw new Error("source missing");
    await seed.harness.repository.transaction((tx) =>
      tx.insert("mediaAssets", { ...asset, id: "source-other" }),
    );
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const gateway = new AiGateway(seed.harness, seed.storage, provider);
    await gateway.generateTaskDraft(seed.teacher, {
      assetId: asset.id,
      requestId: "same-key-other-asset",
    });
    await expect(
      gateway.generateTaskDraft(seed.teacher, {
        assetId: "source-other",
        requestId: "same-key-other-asset",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(provider.calls).toHaveLength(1);
  });

  it("audits input read failure and keeps its reservation charged without leaking storage errors", async () => {
    const seed = await sourceScenario();
    vi.spyOn(seed.storage, "read").mockRejectedValue(new Error("private-cloud-url-and-secret"));
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const gateway = new AiGateway(seed.harness, seed.storage, provider);
    await expect(
      gateway.generateTaskDraft(seed.teacher, {
        assetId: seed.upload.asset.id,
        requestId: "bad-input-audit-request",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const logs = await seed.harness.repository.query("aiInvocations");
    expect(logs[1]).toMatchObject({ status: "FAILED", errorCategory: "INPUT_UNAVAILABLE" });
    expect(JSON.stringify(logs)).not.toContain("private-cloud-url-and-secret");
    expect(provider.calls).toHaveLength(0);
    expect(
      (await seed.harness.repository.query("usageCounters")).map((counter) => counter.used),
    ).toEqual([1, 1]);
  });

  it("blocks concurrent retries of an in-flight reservation without calling the provider twice", async () => {
    const seed = await sourceScenario();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const gateway = new AiGateway(seed.harness, seed.storage, {
      async generateTaskDraft() {
        calls += 1;
        await pending;
        return { confidence: 1, provider: "fake", providerVersion: "1" };
      },
    });
    const input = { assetId: seed.upload.asset.id, requestId: "pending-budget-retry" };
    const first = gateway.generateTaskDraft(seed.teacher, input);
    await vi.waitFor(() => expect(calls).toBe(1));
    const retry = gateway.generateTaskDraft(seed.teacher, input);
    // Release even if this regression fails, so the test cannot hang.
    const outcome = await Promise.race([
      retry.then(
        () => "duplicate",
        (error) => error.code,
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("duplicate-provider-call"), 20)),
    ]);
    release();
    await Promise.allSettled([first, retry]);
    expect(outcome).toBe("CONFLICT");
    expect(calls).toBe(1);
  });

  it("failed calls consume a bounded quota and retries cannot refund or repeat them", async () => {
    const seed = await sourceScenario();
    let calls = 0;
    const gateway = new AiGateway(
      seed.harness,
      seed.storage,
      {
        async generateTaskDraft() {
          calls += 1;
          throw new Error("secret-provider-response");
        },
      },
      { globalDailyLimit: 2, accountDailyLimit: 1 },
    );
    const input = { assetId: seed.upload.asset.id, requestId: "failed-budget-request" };
    await expect(gateway.generateTaskDraft(seed.teacher, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(gateway.generateTaskDraft(seed.teacher, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      gateway.generateTaskDraft(seed.teacher, { ...input, requestId: "failed-budget-new-request" }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(calls).toBe(1);
    expect(JSON.stringify(await seed.harness.repository.query("aiInvocations"))).not.toContain(
      "secret-provider-response",
    );
  });

  it("uses conservative defaults for missing or invalid limits and resets only on a new Shanghai day", async () => {
    const seed = await sourceScenario();
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const gateway = new AiGateway(seed.harness, seed.storage, provider, {
      globalDailyLimit: Number.NaN,
      accountDailyLimit: -1,
    });
    for (let i = 0; i < 5; i++)
      await gateway.generateTaskDraft(seed.teacher, {
        assetId: seed.upload.asset.id,
        requestId: `default-budget-request-${i}`,
      });
    await expect(
      gateway.generateTaskDraft(seed.teacher, {
        assetId: seed.upload.asset.id,
        requestId: "default-budget-over",
      }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    seed.harness.clock.set("2026-09-21T16:00:00.000Z");
    await gateway.generateTaskDraft(seed.teacher, {
      assetId: seed.upload.asset.id,
      requestId: "next-day-budget-request",
    });
    expect(provider.calls).toHaveLength(6);
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

  it("keeps quota and records a fixed failure category if saving the provider result fails", async () => {
    const seed = await sourceScenario();
    const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
    const transaction = seed.harness.repository.transaction.bind(seed.harness.repository);
    vi.spyOn(seed.harness.repository, "transaction")
      .mockImplementationOnce(transaction)
      .mockRejectedValueOnce(new Error("sensitive-database-response"))
      .mockImplementation(transaction);
    const gateway = new AiGateway(seed.harness, seed.storage, provider);
    const input = { assetId: seed.upload.asset.id, requestId: "save-result-failure-request" };
    await expect(gateway.generateTaskDraft(seed.teacher, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const logs = await seed.harness.repository.query("aiInvocations");
    expect(logs.map((log) => log.status)).toEqual(["RESERVED", "FAILED"]);
    expect(logs[1]?.errorCategory).toBe("PERSISTENCE_FAILURE");
    expect(JSON.stringify(logs)).not.toContain("sensitive-database-response");
    expect(await seed.harness.repository.query("taskDrafts")).toHaveLength(0);
    await expect(gateway.generateTaskDraft(seed.teacher, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(provider.calls).toHaveLength(1);
    expect(
      (await seed.harness.repository.query("usageCounters")).map((counter) => counter.used),
    ).toEqual([1, 1]);
  });

  it("preserves the append-only reservation and completion audit in the fake repository", async () => {
    const seed = await sourceScenario();
    const gateway = new AiGateway(
      seed.harness,
      seed.storage,
      new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" }),
    );
    await gateway.generateTaskDraft(seed.teacher, {
      assetId: seed.upload.asset.id,
      requestId: "immutable-reservation-request",
    });
    for (const audit of await seed.harness.repository.query("aiInvocations")) {
      await expect(
        seed.harness.repository.transaction((tx) =>
          tx.update("aiInvocations", audit.id, { status: "FAILED" }),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        seed.harness.repository.transaction((tx) => tx.remove("aiInvocations", audit.id)),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
