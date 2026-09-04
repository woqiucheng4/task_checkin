import { describe, expect, it } from "vitest";

import { MediaService } from "../../src/application/media-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeMediaStorage, FakeOcrProvider } from "../helpers/media-fakes.js";

describe("media retention", () => {
  it("deletes expired storage content and preserves only deleted metadata", async () => {
    const seed = await createIdentityScenario(1);
    const storage = new FakeMediaStorage();
    const media = new MediaService(
      seed.harness,
      storage,
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const upload = await media.createUploadIntent(seed.teacher, {
      byteSize: 100_000,
      mimeType: "image/png",
      ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      purpose: "TASK_SOURCE",
      requestId: "retention-upload-intent",
      retentionDays: 1,
    });
    await media.recordUpload(seed.teacher, {
      assetId: upload.asset.id,
      observedByteSize: 100_000,
      observedMimeType: "image/png",
      requestId: "retention-upload-recorded",
    });
    seed.harness.clock.set("2026-09-07T10:00:00.000Z");

    const result = await media.deleteExpiredAssets(seed.platform, {
      requestId: "retention-delete-expired",
    });

    expect(result.deletedCount).toBe(1);
    expect(storage.deletedKeys).toEqual([upload.asset.storageKey]);
    expect(await seed.harness.repository.read("mediaAssets", upload.asset.id)).toMatchObject({
      status: "DELETED",
    });
    await expect(media.readAsset(seed.teacher, upload.asset.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
