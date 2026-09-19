import type { MediaStorage } from "../application/ports.js";
import { DomainError } from "../shared/errors.js";

export interface CloudStorage {
  downloadFile(input: { fileID: string }): Promise<{ fileContent?: Buffer }>;
  uploadFile(input: { cloudPath: string; fileContent: Buffer }): Promise<{ fileID?: string }>;
  deleteFile(input: { fileList: string[] }): Promise<{ fileList?: { status: number }[] }>;
  getTempFileURL?(input: {
    fileList: string[];
  }): Promise<{ fileList?: { status: number; tempFileURL?: string }[] }>;
}

function requireOwnPath(path: string): void {
  if (
    !/^task-checkin\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) ||
    path.split("/").some((p) => p === "." || p === "..")
  ) {
    throw new DomainError("FORBIDDEN", "禁止访问其他小程序的存储路径");
  }
}

export class CloudMediaStorage implements MediaStorage {
  constructor(private readonly cloud: CloudStorage) {}
  async createUploadUrl(storageKey: string): Promise<string> {
    requireOwnPath(storageKey);
    // An opaque upload intent, not a public upload URL. Bytes go through UPLOAD_MEDIA_CONTENT.
    return `task-checkin-upload://${storageKey}`;
  }
  async upload(storageKey: string, content: Uint8Array): Promise<string> {
    requireOwnPath(storageKey);
    const result = await this.cloud.uploadFile({
      cloudPath: storageKey,
      fileContent: Buffer.from(content),
    });
    if (!result.fileID) throw new DomainError("INTERNAL_ERROR", "图片上传失败，请重试");
    return result.fileID;
  }
  async read(fileId: string): Promise<Uint8Array> {
    const match = /^cloud:\/\/[^/]+\/(.+)$/.exec(fileId);
    if (!match?.[1]) throw new DomainError("FORBIDDEN", "读取必须使用本项目云文件 ID");
    requireOwnPath(match[1]);
    const result = await this.cloud.downloadFile({ fileID: fileId });
    if (!result.fileContent?.byteLength) {
      throw new DomainError("INTERNAL_ERROR", "图片暂时无法读取");
    }
    return new Uint8Array(result.fileContent);
  }
  async delete(fileId: string): Promise<void> {
    const match = /^cloud:\/\/[^/]+\/(.+)$/.exec(fileId);
    if (!match?.[1]) throw new DomainError("FORBIDDEN", "删除必须使用本项目的云文件 ID");
    requireOwnPath(match[1]);
    const result = await this.cloud.deleteFile({ fileList: [fileId] });
    if (!result.fileList?.length || result.fileList.some((file) => file.status !== 0)) {
      throw new DomainError("INTERNAL_ERROR", "云文件删除未成功");
    }
  }
  async downloadUrl(fileId: string): Promise<string> {
    const match = /^cloud:\/\/[^/]+\/(.+)$/.exec(fileId);
    if (!match?.[1]) throw new DomainError("FORBIDDEN", "读取必须使用本项目云文件 ID");
    requireOwnPath(match[1]);
    const result = await this.cloud.getTempFileURL?.({ fileList: [fileId] });
    const file = result?.fileList?.[0];
    if (file?.status !== 0 || !file.tempFileURL?.startsWith("https://"))
      throw new DomainError("INTERNAL_ERROR", "图片暂时无法读取");
    return file.tempFileURL;
  }
}
