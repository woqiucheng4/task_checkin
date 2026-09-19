import { expect, it } from "vitest";
import { uploadEvidence } from "../../miniprogram/services/upload-evidence.js";
import { uploadTaskSource } from "../../miniprogram/services/upload-task-source.js";

it("submits a server-owned media id rather than the underlying cloud file id", async () => {
  const calls: unknown[] = [];
  const assetId = await uploadEvidence(
    {
      async execute(action, payload) {
        calls.push({ action, payload });
        return {
          ok: true,
          data:
            action === "CREATE_UPLOAD_INTENT"
              ? { asset: { id: "media-new" } }
              : {
                  id: "media-new",
                  fileId: "cloud://env/task-checkin/family/file",
                  status: "ACTIVE",
                },
        };
      },
    },
    "assignment-own",
    "/9j/4AAB/9k=",
  );
  expect(assetId).toBe("media-new");
  expect(calls).toEqual([
    {
      action: "CREATE_UPLOAD_INTENT",
      payload: {
        assignmentId: "assignment-own",
        purpose: "SUBMISSION_EVIDENCE",
        mimeType: "image/jpeg",
        byteSize: 8,
        retentionDays: 90,
      },
    },
    { action: "UPLOAD_MEDIA_CONTENT", payload: { assetId: "media-new", base64: "/9j/4AAB/9k=" } },
  ]);
});

it("creates a private task source under the selected owner scope", async () => {
  const calls: unknown[] = [];
  await expect(
    uploadTaskSource(
      {
        async execute(action, payload) {
          calls.push({ action, payload });
          return action === "CREATE_UPLOAD_INTENT"
            ? { ok: true, data: { asset: { id: "task-source-own" } } }
            : { ok: true, data: { id: "task-source-own", status: "ACTIVE" } };
        },
      },
      { kind: "FAMILY", familyId: "family-own" },
      "/9j/4AAB/9k=",
    ),
  ).resolves.toBe("task-source-own");
  expect(calls[0]).toMatchObject({
    action: "CREATE_UPLOAD_INTENT",
    payload: {
      ownerScope: { kind: "FAMILY", familyId: "family-own" },
      purpose: "TASK_SOURCE",
      mimeType: "image/jpeg",
      byteSize: 8,
      retentionDays: 90,
    },
  });
});

it("rejects invalid or oversized task-source bytes before requesting an upload intent", async () => {
  const execute = async () => ({ ok: true as const, data: {} });
  await expect(
    uploadTaskSource({ execute }, { kind: "FAMILY", familyId: "family-own" }, "not-an-image"),
  ).rejects.toThrow("JPG、PNG 或 WebP");
  await expect(
    uploadTaskSource(
      { execute },
      { kind: "FAMILY", familyId: "family-own" },
      `/9j/${"A".repeat(1_333_334)}`,
    ),
  ).rejects.toThrow("JPG、PNG 或 WebP");
});
