import type {
  MediaStorage,
  RecognizedTaskFields,
  TaskDraftProvider,
} from "../../src/application/ports.js";

export class FakeMediaStorage implements MediaStorage {
  readonly uploadRequests: { storageKey: string; expiresAt: string }[] = [];
  readonly deletedKeys: string[] = [];
  private readonly privateFiles = new Map<string, Uint8Array>();

  async createUploadUrl(storageKey: string, expiresAt: string): Promise<string> {
    this.uploadRequests.push({ expiresAt, storageKey });
    return `https://upload.invalid/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    this.deletedKeys.push(storageKey);
  }

  setPrivateFile(fileId: string, content: Uint8Array): void {
    this.privateFiles.set(fileId, new Uint8Array(content));
  }

  async read(fileId: string): Promise<Uint8Array> {
    const content = this.privateFiles.get(fileId);
    if (content === undefined) throw new Error(`missing private file ${fileId}`);
    return new Uint8Array(content);
  }
}

export class FakeOcrProvider implements TaskDraftProvider {
  readonly calls: { image: Uint8Array; mimeType: string; requestId: string }[] = [];

  constructor(private readonly result: RecognizedTaskFields) {}

  async generateTaskDraft(input: {
    readonly image: Uint8Array;
    readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
    readonly requestId: string;
  }): Promise<RecognizedTaskFields> {
    this.calls.push({ image: new Uint8Array(input.image), mimeType: input.mimeType, requestId: input.requestId });
    return structuredClone(this.result);
  }
}

export class FakeVerifiedMediaStorage extends FakeMediaStorage {
  async upload(storageKey: string, content: Uint8Array): Promise<string> {
    const fileId = `cloud://test/${storageKey}`;
    this.setPrivateFile(fileId, content);
    return fileId;
  }
}
