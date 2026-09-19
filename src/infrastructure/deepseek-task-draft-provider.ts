import type { RecognizedTaskFields, TaskDraftProvider } from "../application/ports.js";
import { DomainError } from "../shared/errors.js";

const COMPLETIONS_PATH = "/chat/completions";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const FAILURE_MESSAGE = "图片暂时无法生成任务草稿，请手动填写";
const MAX_RESPONSE_BYTES = 16 * 1024;
const TIMEOUT_MS = 12_000;
const CATEGORIES = new Set([
  "LIFE",
  "LANGUAGE",
  "MATHEMATICS",
  "ENGLISH",
  "SCIENCE",
  "ART",
  "SPORT",
  "OTHER",
]);
const SUBMISSION_MODES = new Set(["CONFIRM", "TEXT", "PHOTO", "TEXT_AND_PHOTO"]);

export interface DeepSeekTaskDraftProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

interface DeepSeekDraftResponse {
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly startsAt: string;
  readonly dueAt: string;
  readonly submissionMode: string;
  readonly confidence: number;
}

/** Sends only caller-provided private bytes to DeepSeek; it never resolves a URL. */
export class DeepSeekTaskDraftProvider implements TaskDraftProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: DeepSeekTaskDraftProviderOptions) {
    if (options.apiKey.trim() === "") throw new Error("DEEPSEEK_API_KEY is required");
    this.apiKey = options.apiKey.trim();
    this.baseUrl = parseBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async generateTaskDraft(input: Parameters<TaskDraftProvider["generateTaskDraft"]>[0]): Promise<RecognizedTaskFields> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetch(`${this.baseUrl}${COMPLETIONS_PATH}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-flash",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "请识别图片中的任务。只输出一个 JSON 对象，且必须包含 title、description、category、startsAt、dueAt、submissionMode、confidence；category 只能是 LIFE、LANGUAGE、MATHEMATICS、ENGLISH、SCIENCE、ART、SPORT、OTHER；submissionMode 只能是 CONFIRM、TEXT、PHOTO、TEXT_AND_PHOTO；时间必须为 UTC ISO-8601。",
                },
                {
                  type: "image_url",
                  image_url: { url: `data:${input.mimeType};base64,${Buffer.from(input.image).toString("base64")}` },
                },
              ],
            },
          ],
        }),
      });
      if (!response.ok) throw new Error("DeepSeek request failed");
      const payload = JSON.parse(await readLimited(response)) as unknown;
      return normalizeResponse(payload);
    } catch {
      throw unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DEEPSEEK_BASE_URL must be a safe HTTPS URL");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.deepseek.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("DEEPSEEK_BASE_URL must be a safe HTTPS URL");
  }
  return "https://api.deepseek.com";
}

async function readLimited(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error("response too large");
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("response body missing");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("response too large");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

function normalizeResponse(value: unknown): RecognizedTaskFields {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length !== 1) throw new Error("invalid response");
  const message = value.choices[0];
  if (!isRecord(message) || !isRecord(message.message) || typeof message.message.content !== "string")
    throw new Error("invalid response");
  const content = message.message.content.trim();
  if (!content.startsWith("{") || !content.endsWith("}")) throw new Error("not a JSON object");
  let fields: unknown;
  try {
    fields = JSON.parse(content);
  } catch {
    throw new Error("invalid JSON");
  }
  if (!isExactDraft(fields)) throw new Error("invalid task draft");
  return {
    title: fields.title,
    description: fields.description,
    category: fields.category,
    startsAt: fields.startsAt,
    dueAt: fields.dueAt,
    submissionMode: fields.submissionMode,
    confidence: fields.confidence,
    provider: "deepseek",
    providerVersion: "deepseek-flash",
  };
}

function isExactDraft(value: unknown): value is DeepSeekDraftResponse {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = ["category", "confidence", "description", "dueAt", "startsAt", "submissionMode", "title"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  return (
    isText(value.title, 160) &&
    isText(value.description, 2_000) &&
    typeof value.category === "string" &&
    CATEGORIES.has(value.category) &&
    isIsoInstant(value.startsAt) &&
    isIsoInstant(value.dueAt) &&
    typeof value.submissionMode === "string" &&
    SUBMISSION_MODES.has(value.submissionMode) &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1
  );
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unavailable(): DomainError {
  return new DomainError("CONFLICT", FAILURE_MESSAGE);
}
