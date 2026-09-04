import type {
  MediaStorage,
  OcrProvider,
  RecognizedTaskFields,
} from "../../src/application/ports.js";

export class FakeMediaStorage implements MediaStorage {
  readonly uploadRequests: { storageKey: string; expiresAt: string }[] = [];
  readonly deletedKeys: string[] = [];

  async createUploadUrl(storageKey: string, expiresAt: string): Promise<string> {
    this.uploadRequests.push({ expiresAt, storageKey });
    return `https://upload.invalid/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    this.deletedKeys.push(storageKey);
  }
}

export class FakeOcrProvider implements OcrProvider {
  readonly calls: string[] = [];

  constructor(private readonly result: RecognizedTaskFields) {}

  async recognize(storageKey: string): Promise<RecognizedTaskFields> {
    this.calls.push(storageKey);
    return structuredClone(this.result);
  }
}
