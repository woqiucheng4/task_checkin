import type { MediaAsset } from "./model.js";
import { DomainError } from "../shared/errors.js";

export const ALLOWED_IMAGE_MIME_TYPES: readonly MediaAsset["mimeType"][] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function assertValidMediaInput(input: {
  readonly mimeType: string;
  readonly byteSize: number;
  readonly retentionDays: number;
}): asserts input is {
  readonly mimeType: MediaAsset["mimeType"];
  readonly byteSize: number;
  readonly retentionDays: number;
} {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(input.mimeType as MediaAsset["mimeType"])) {
    throw new DomainError("INVALID_INPUT", "只支持 JPEG、PNG 或 WebP 图片");
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > 10_000_000) {
    throw new DomainError("INVALID_INPUT", "图片大小必须在 1 字节至 10 MB 之间");
  }
  if (
    !Number.isInteger(input.retentionDays) ||
    input.retentionDays < 1 ||
    input.retentionDays > 365
  ) {
    throw new DomainError("INVALID_INPUT", "图片保存期限必须是 1 至 365 天");
  }
}

export function addDays(instant: string, days: number): string {
  const date = new Date(instant);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
