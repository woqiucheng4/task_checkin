import { imageUploadMetadata } from "./upload-evidence.js";
import { command } from "./session-runtime.js";

/**
 * Persists an avatar picked with WeChat's `chooseAvatar` or returned by
 * `getUserProfile`. Profile avatars are remote URLs, while chooseAvatar
 * returns a temporary local file; neither source is stored directly.
 */
export async function uploadAccountAvatar(filePath: string): Promise<string> {
  const base64 = readFileAsBase64(await localAvatarFile(filePath));
  const { byteSize, mimeType } = imageUploadMetadata(base64);
  const intent = await command<{ asset: { id: string } }>("CREATE_UPLOAD_INTENT", {
    byteSize,
    mimeType,
    purpose: "AVATAR",
    retentionDays: 365,
  });
  const saved = await command<{ id: string; status: string }>("UPLOAD_MEDIA_CONTENT", {
    assetId: intent.asset.id,
    base64,
  });
  if (saved.id !== intent.asset.id || saved.status !== "ACTIVE") {
    throw new Error("头像未上传完成，请重试");
  }
  return saved.id;
}

async function localAvatarFile(filePath: string): Promise<string> {
  if (!/^https?:\/\//.test(filePath)) return filePath;
  try {
    const downloaded = await wx.downloadFile({ url: filePath });
    if (downloaded.statusCode !== 200 || !downloaded.tempFilePath)
      throw new Error("download failed");
    return downloaded.tempFilePath;
  } catch {
    throw new Error("头像下载失败，请重试");
  }
}

function readFileAsBase64(filePath: string): string {
  try {
    const base64 = wx.getFileSystemManager().readFileSync(filePath, "base64");
    if (!base64) throw new Error("empty");
    return base64;
  } catch {
    throw new Error("头像文件读取失败");
  }
}
