import { describe, expect, it } from "vitest";
import { MediaService } from "../../src/application/media-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeMediaStorage, FakeOcrProvider } from "../helpers/media-fakes.js";

async function scenario() {
  const seed = await createIdentityScenario(1);
  const objects = new Map<string, Uint8Array>();
  const storage = Object.assign(new FakeMediaStorage(), {
    async upload(key: string, bytes: Uint8Array) {
      objects.set(key, bytes);
      return `cloud://checkin-env/${key}`;
    },
    async downloadUrl() {
      return "https://storage.example/signed-image";
    },
  });
  const media = new MediaService(
    seed.harness,
    storage,
    new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
  );
  const content = Buffer.from([255, 216, 255, 224, 0, 1, 255, 217]);
  const intent = await media.createUploadIntent(seed.guardian, {
    childId: seed.firstChild.id,
    purpose: "TASK_SOURCE",
    ownerScope: { kind: "FAMILY", familyId: seed.family.id },
    byteSize: content.length,
    mimeType: "image/jpeg",
    retentionDays: 90,
    requestId: "verified-upload-intent",
  });
  return { ...seed, media, content, intent, objects };
}

describe("verified upload boundary", () => {
  it("stores only in the app namespace and persists the server-returned fileID", async () => {
    const seed = await scenario();
    const asset = await seed.media.uploadContent(seed.guardian, {
      childId: seed.firstChild.id,
      assetId: seed.intent.asset.id,
      base64: seed.content.toString("base64"),
      requestId: "verified-upload-content",
    });
    expect([...seed.objects.keys()]).toEqual([expect.stringMatching(/^task-checkin\/family\//)]);
    expect(asset).toMatchObject({
      status: "ACTIVE",
      fileId: expect.stringMatching(/^cloud:\/\/checkin-env\/task-checkin\//),
    });
    expect(await seed.harness.repository.read("mediaAssets", asset.id)).toMatchObject({
      fileId: asset.fileId,
    });
    expect(await seed.media.readAsset(seed.guardian, asset.id)).toMatchObject({
      downloadUrl: "https://storage.example/signed-image",
    });
  });
  it("stores an opted-in account avatar privately and only lets its owner bind it", async () => {
    const seed = await scenario();
    const avatarIntent = await seed.media.createUploadIntent(seed.guardian, {
      purpose: "AVATAR",
      byteSize: seed.content.length,
      mimeType: "image/jpeg",
      retentionDays: 365,
      requestId: "profile-avatar-intent",
    });
    const avatar = await seed.media.uploadContent(seed.guardian, {
      assetId: avatarIntent.asset.id,
      base64: seed.content.toString("base64"),
      requestId: "profile-avatar-content",
    });

    expect(avatar.storageKey).toMatch(
      new RegExp(`^task-checkin/account/${seed.guardian.accountId}/`),
    );
    await expect(
      seed.identity.updateAccountProfile(seed.guardian, {
        avatarAssetId: avatar.id,
        displayName: "小明妈妈",
        requestId: "profile-avatar-bind",
      }),
    ).resolves.toMatchObject({ avatarAssetId: avatar.id, displayName: "小明妈妈" });
    await expect(
      seed.identity.updateAccountProfile(seed.teacher, {
        avatarAssetId: avatar.id,
        requestId: "profile-avatar-forge",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects forged content before storage writes", async () => {
    const seed = await scenario();
    await expect(
      seed.media.uploadContent(seed.guardian, {
        childId: seed.firstChild.id,
        assetId: seed.intent.asset.id,
        base64: Buffer.from("notimage").toString("base64"),
        requestId: "verified-upload-forgery",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(seed.objects.size).toBe(0);
    expect(await seed.harness.repository.read("mediaAssets", seed.intent.asset.id)).toMatchObject({
      status: "PENDING_UPLOAD",
    });
  });
  it("cannot activate real storage assets by claiming a MIME type and size", async () => {
    const seed = await scenario();
    await expect(
      seed.media.recordUpload(seed.guardian, {
        childId: seed.firstChild.id,
        assetId: seed.intent.asset.id,
        observedByteSize: seed.content.length,
        observedMimeType: "image/jpeg",
        requestId: "verified-upload-bypass",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
