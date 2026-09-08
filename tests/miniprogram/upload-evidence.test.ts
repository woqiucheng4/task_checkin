import { expect, it } from "vitest";
import { uploadEvidence } from "../../miniprogram/services/upload-evidence.js";

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
        retentionDays: 30,
      },
    },
    { action: "UPLOAD_MEDIA_CONTENT", payload: { assetId: "media-new", base64: "/9j/4AAB/9k=" } },
  ]);
});
