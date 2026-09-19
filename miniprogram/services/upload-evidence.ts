import type { CoreAction } from "../../src/application/core-api.js";
import type { CommandResult } from "../../src/shared/result.js";

export async function uploadEvidence(
  client: {
    execute(
      action: CoreAction,
      payload: Readonly<Record<string, unknown>>,
    ): Promise<CommandResult<unknown>>;
  },
  assignmentId: string,
  base64: string,
): Promise<string> {
  const mimeType = base64.startsWith("/9j/")
    ? "image/jpeg"
    : base64.startsWith("iVBORw0KGgo")
      ? "image/png"
      : base64.startsWith("UklGR")
        ? "image/webp"
        : "";
  const byteSize =
    (base64.length * 3) / 4 - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (!mimeType || byteSize > 1_000_000 || byteSize < 1)
    throw new Error("请选择小于 1 MB 的 JPG、PNG 或 WebP 图片");
  const intent = await client.execute("CREATE_UPLOAD_INTENT", {
    assignmentId,
    purpose: "SUBMISSION_EVIDENCE",
    mimeType,
    byteSize,
    retentionDays: 90,
  });
  if (!intent.ok) throw new Error(intent.error.message);
  const { asset } = intent.data as { asset: { id: string } };
  const upload = await client.execute("UPLOAD_MEDIA_CONTENT", { assetId: asset.id, base64 });
  if (!upload.ok) throw new Error(upload.error.message);
  const saved = upload.data as { id: string; status: string };
  if (saved.id !== asset.id || saved.status !== "ACTIVE") throw new Error("图片未上传完成，请重试");
  return saved.id;
}
