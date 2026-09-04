import { describe, expect, it } from "vitest";

import { MediaService } from "../../src/application/media-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";
import { FakeMediaStorage, FakeOcrProvider } from "../helpers/media-fakes.js";

describe("submission evidence", () => {
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
      retentionDays: 30,
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

    await expect(media.readAsset(seed.guardian, upload.asset.id)).resolves.toMatchObject({
      id: upload.asset.id,
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
  });
});
