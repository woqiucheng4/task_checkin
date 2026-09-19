import { describe, expect, it } from "vitest";

import { MediaService } from "../../src/application/media-service.js";
import { ReviewService } from "../../src/application/review-service.js";
import { SubmissionService } from "../../src/application/submission-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { ViewModelService } from "../../src/application/view-models.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeOcrProvider, FakeVerifiedMediaStorage } from "../helpers/media-fakes.js";

describe("child-teacher AI MVP acceptance", () => {
  it("keeps sibling data private through activation, join, image task, AI draft and review", async () => {
    // The fixture activates the teacher, creates its workspace/group, and only claims/approves child A.
    const seed = await createIdentityScenario(2, 1);
    seed.harness.clock.set("2026-09-05T09:00:00.000Z");
    const childA = seed.children[0];
    const childB = seed.children[1];
    if (childA === undefined || childB === undefined) throw new Error("sibling fixture missing");

    const childAActor: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: childA.id,
      mode: "CHILD",
    };
    const childBActor: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: childB.id,
      mode: "CHILD",
    };
    const storage = new FakeVerifiedMediaStorage();
    const media = new MediaService(
      seed.harness,
      storage,
      new FakeOcrProvider({
        category: "MATHEMATICS",
        confidence: 0.95,
        dueAt: "2026-09-05T13:00:00.000Z",
        provider: "local-acceptance-ai",
        providerVersion: "1",
        startsAt: "2026-09-05T09:00:00.000Z",
        submissionMode: "CONFIRM",
        title: "题图数学练习",
      }),
    );

    const upload = await media.createUploadIntent(seed.teacher, {
      byteSize: 200_000,
      mimeType: "image/jpeg",
      ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      purpose: "TASK_SOURCE",
      requestId: "acceptance-source-intent",
      retentionDays: 90,
    });
    await media.uploadContent(seed.teacher, {
      assetId: upload.asset.id,
      base64: Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(199_997)]).toString(
        "base64",
      ),
      requestId: "acceptance-source-upload",
    });
    const draft = await media.recognizeTaskDraft(seed.teacher, {
      assetId: upload.asset.id,
      requestId: "acceptance-ai-draft",
    });
    const task = await media.publishDraft(seed.teacher, {
      allowLateSubmission: true,
      draftId: draft.id,
      estimatedMinutes: 15,
      groupId: seed.group.id,
      importance: "REQUIRED",
      occurrenceDate: "2026-09-05",
      requestId: "acceptance-draft-publish",
      requiresAcademicReview: true,
      schedule: { date: "2026-09-05", kind: "ONCE" },
    });
    const assignments = await seed.harness.repository.query("taskAssignments", { taskId: task.id });
    const assignmentA = assignments[0];
    if (assignmentA === undefined) throw new Error("child A assignment missing");

    await new SubmissionService(seed.harness).submit(childAActor, {
      assignmentId: assignmentA.id,
      mediaAssetIds: [],
      requestId: "acceptance-child-a-submit",
    });
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);
    await reviews.academicReview(seed.teacher, {
      assignmentId: assignmentA.id,
      decision: "APPROVE",
      requestId: "acceptance-teacher-approve",
    });
    await reviews.academicReview(seed.teacher, {
      assignmentId: assignmentA.id,
      decision: "APPROVE",
      requestId: "acceptance-teacher-approve-repeat",
    });

    expect(seed.memberships).toHaveLength(1);
    expect(seed.memberships[0]).toMatchObject({ childId: childA.id, status: "ACTIVE" });
    expect(
      await new ViewModelService(seed.harness).childToday(childAActor, "2026-09-05"),
    ).toMatchObject({
      mustDo: [expect.objectContaining({ assignmentId: assignmentA.id, taskState: "COMPLETED" })],
    });
    expect(await sunlight.balanceForChild(childA.id)).toBe(2);
    expect(
      await seed.harness.repository.query("sunlightLedgers", { referenceId: assignmentA.id }),
    ).toHaveLength(1);

    expect(
      await new ViewModelService(seed.harness).childToday(childBActor, "2026-09-05"),
    ).toMatchObject({
      mustDo: [],
    });
    expect(await seed.harness.repository.query("taskAssignments", { childId: childB.id })).toEqual(
      [],
    );
    expect(await sunlight.balanceForChild(childB.id)).toBe(0);
    await expect(media.readAsset(childBActor, upload.asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      media.recognizeTaskDraft(childBActor, {
        assetId: upload.asset.id,
        requestId: "acceptance-child-b-ai-denied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await seed.harness.repository.query("taskDrafts")).toEqual([
      expect.objectContaining({ id: draft.id }),
    ]);
    expect(await seed.harness.repository.query("aiInvocations")).toHaveLength(1);
  });
});
