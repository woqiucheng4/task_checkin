import type {
  CoreAction,
  CoreActorSelection,
  CoreCommand,
} from "../../src/application/core-api.js";
import type { CommandResult } from "../../src/shared/result.js";
import { TASK_CHECKIN_CLOUD_FUNCTION } from "../config/env.js";

export interface CloudFunctionCaller {
  callFunction(input: {
    readonly name: string;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly result?: unknown }>;
}

export type RequestIdFactory = () => string;

export class CoreApiClient {
  constructor(
    private readonly cloud: CloudFunctionCaller,
    private readonly requestIds: RequestIdFactory = createRequestId,
  ) {}

  async execute(
    action: CoreAction,
    rawPayload: Readonly<Record<string, unknown>>,
    actor?: CoreActorSelection,
  ): Promise<CommandResult<unknown>> {
    const payload = removeCallerIdentity(rawPayload);
    const command: CoreCommand = {
      action,
      ...(actor === undefined ? {} : { actor: structuredClone(actor) }),
      payload,
      requestId: this.requestIds(),
    };
    const response = await this.cloud.callFunction({
      data: { ...command },
      name: TASK_CHECKIN_CLOUD_FUNCTION,
    });
    if (!isCommandResult(response.result)) {
      throw new Error("taskCheckinCoreApi 返回格式无效");
    }
    return response.result;
  }
}

export async function callCoreApi(
  cloud: CloudFunctionCaller,
  action: CoreAction,
  payload: Readonly<Record<string, unknown>>,
  actor?: CoreActorSelection,
): Promise<CommandResult<unknown>> {
  return new CoreApiClient(cloud).execute(action, payload, actor);
}

function removeCallerIdentity(
  payload: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key !== "openId" && key !== "OPENID") {
      clean[key] = structuredClone(value);
    }
  }
  return clean;
}

function createRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `req-${Date.now().toString(36)}-${random.padEnd(12, "0")}`;
}

function isCommandResult(value: unknown): value is CommandResult<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean" &&
    (value.ok ? "data" in value : "error" in value)
  );
}
