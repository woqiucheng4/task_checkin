import { describe, expect, it } from "vitest";

import { MediaService } from "../../src/application/media-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";
import { FakeMediaStorage, FakeOcrProvider } from "../helpers/media-fakes.js";

describe("submission evidence", () => {
  it("requires ninety-day retention for submission evidence", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );

    await expect(
      media.createUploadIntent(seed.childActor, {
        assignmentId: seed.assignment.id,
        byteSize: 200_000,
        mimeType: "image/jpeg",
        purpose: "SUBMISSION_EVIDENCE",
        requestId: "evidence-short-retention",
        retentionDays: 30,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects more than three evidence IDs before accepting a submission", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");

    await expect(
      seed.submissions.supplement(seed.childActor, {
        assignmentId: seed.assignment.id,
        mediaAssetIds: ["one", "two", "three", "four"],
        requestId: "too-many-evidence-ids",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("is readable only by guardians and authorized assignment reviewers", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({
        confidence: 0,
        provider: "unused",
        providerVersion: "unused",
      }),
    );
    const upload = await media.createUploadIntent(seed.childActor, {
      assignmentId: seed.assignment.id,
      byteSize: 200_000,
      mimeType: "image/jpeg",
      purpose: "SUBMISSION_EVIDENCE",
      requestId: "evidence-upload-intent",
      retentionDays: 90,
    });
    await media.recordUpload(seed.childActor, {
      assetId: upload.asset.id,
      observedByteSize: 200_000,
      observedMimeType: "image/jpeg",
      requestId: "evidence-upload-recorded",
    });
    const submission = (
      await seed.harness.repository.query("submissions", { assignmentId: seed.assignment.id })
    )[0];
    if (submission === undefined) {
      throw new Error("submission fixture missing");
    }
    await media.attachSubmissionEvidence(seed.childActor, {
      assetId: upload.asset.id,
      requestId: "evidence-attach-1",
      submissionId: submission.id,
    });

    expect(upload.asset.expiresAt).toBe("2026-12-04T09:00:00.000Z");

    await expect(media.readAsset(seed.guardian, upload.asset.id)).resolves.toMatchObject({
      id: upload.asset.id,
    });
    await expect(media.readAsset(seed.childActor, upload.asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(media.readAsset(seed.teacher, upload.asset.id)).resolves.toMatchObject({
      id: upload.asset.id,
    });
    const outsiderAccount = await seed.identity.createAccount({
      openId: "wx-evidence-outsider",
      requestId: "evidence-outsider-account",
    });
    const outsider: ActorContext = { accountId: outsiderAccount.id, mode: "ACCOUNT" };
    await expect(media.readAsset(outsider, upload.asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const membership = seed.memberships[0];
    if (!membership) throw new Error("Membership missing");
    await seed.invitations.withdrawChild(seed.guardian, {
      childGroupMembershipId: membership.id,
      requestId: "evidence-withdraw-child-0001",
    });
    await expect(media.readAsset(seed.teacher, upload.asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
