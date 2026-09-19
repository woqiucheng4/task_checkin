import type { CoreAction } from "../../src/application/core-api.js";
import type { TenantScope } from "../../src/domain/model.js";
import type { CommandResult } from "../../src/shared/result.js";
import { imageUploadMetadata } from "./upload-evidence.js";

type CommandClient = {
  execute(
    action: CoreAction,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<CommandResult<unknown>>;
};

/** Uploads a private image that may only be used as a publisher-owned task source. */
export async function uploadTaskSource(
  client: CommandClient,
  ownerScope: Extract<TenantScope, { readonly kind: "FAMILY" | "ORGANIZATION" }>,
  base64: string,
): Promise<string> {
  const { byteSize, mimeType } = imageUploadMetadata(base64);
  const intent = await client.execute("CREATE_UPLOAD_INTENT", {
    byteSize,
    mimeType,
    ownerScope,
    purpose: "TASK_SOURCE",
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
