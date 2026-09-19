import { createHash } from "node:crypto";

import type { ApplicationDependencies, MediaStorage, RecognizedTaskFields, TaskDraftProvider } from "./ports.js";
import type { ActorContext, MediaAsset, SubmissionMode, TaskCategory, TaskDraft } from "../domain/model.js";
import { AccessPolicy } from "../domain/policy.js";
import { DomainError } from "../shared/errors.js";

export interface AiGatewayConfig {
  /** Defaults to enabled so manual task creation is unaffected by provider configuration. */
  readonly enabled?: boolean;
}

interface RequestBase {
  readonly assetId: string;
  readonly requestId: string;
}

/**
 * The only route from a private task image to an AI provider. It intentionally
 * accepts neither a storage key nor an externally readable URL.
 */
export class AiGateway {
  private readonly policy: AccessPolicy;
  private readonly enabled: boolean;

  constructor(
    private readonly dependencies: ApplicationDependencies,
    private readonly storage: MediaStorage,
    private readonly provider: TaskDraftProvider,
    config: AiGatewayConfig = {},
  ) {
    this.policy = new AccessPolicy(dependencies.repository);
    this.enabled = config.enabled ?? true;
  }

  async generateTaskDraft(actor: ActorContext, input: RequestBase): Promise<TaskDraft> {
    requireRequestId(input.requestId);
    if (!this.enabled) {
      throw new DomainError("FEATURE_DISABLED", "AI 任务草稿功能暂未开启");
    }
    const asset = await this.requirePublishableSourceAsset(actor, input.assetId);
    if (asset.fileId === undefined) {
      throw new DomainError("CONFLICT", "任务图片尚未可供服务端读取");
    }

    const image = await this.storage.read(asset.fileId);
    if (image.byteLength === 0 || image.byteLength !== asset.byteSize) {
      throw new DomainError("CONFLICT", "任务图片读取结果无效");
    }
    const result = await this.provider.generateTaskDraft({
      image,
      mimeType: asset.mimeType,
      requestId: input.requestId,
    });
    const now = this.dependencies.clock.now();
    const fields = normalizeRecognizedFields(result);
    const draft: TaskDraft = {
      id: this.dependencies.ids.next("task_draft"),
      confidence: fields.confidence,
      createdAt: now,
      createdByAccountId: actor.accountId,
      ...(fields.description === undefined ? {} : { description: fields.description }),
      ...(fields.dueAt === undefined ? {} : { dueAt: fields.dueAt }),
      ownerScope: asset.ownerScope,
      provider: fields.provider,
      providerVersion: fields.providerVersion,
      sourceAssetId: asset.id,
      ...(fields.startsAt === undefined ? {} : { startsAt: fields.startsAt }),
      status: "DRAFT",
      ...(fields.category === undefined ? {} : { category: fields.category }),
      ...(fields.submissionMode === undefined ? {} : { submissionMode: fields.submissionMode }),
      ...(fields.title === undefined ? {} : { title: fields.title }),
      updatedAt: now,
    };
    const invocation = {
      id: this.dependencies.ids.next("ai_invocation"),
      actorAccountId: actor.accountId,
      assetId: asset.id,
      createdAt: now,
      inputByteSize: image.byteLength,
      inputImageCount: 1,
      inputSha256: createHash("sha256").update(image).digest("hex"),
      provider: fields.provider,
      providerVersion: fields.providerVersion,
      requestId: input.requestId,
      resultSummary: {
        confidence: fields.confidence,
        recognizedFieldCount: recognizedFieldCount(fields),
      },
      tenantScope: asset.ownerScope,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("aiInvocations", invocation);
      await tx.insert("taskDrafts", draft);
      return draft;
    });
  }

  private async requirePublishableSourceAsset(actor: ActorContext, assetId: string): Promise<MediaAsset> {
    if (actor.mode !== "ACCOUNT") {
      throw new DomainError("FORBIDDEN", "只有具备任务发布权限的成人可以识别任务图片");
    }
    const asset = await this.dependencies.repository.read("mediaAssets", assetId);
    if (asset?.status !== "ACTIVE" || asset.purpose !== "TASK_SOURCE") {
      throw new DomainError("NOT_FOUND", "任务图片不存在或不可识别");
    }
    if (asset.uploaderAccountId !== actor.accountId) {
      throw new DomainError("FORBIDDEN", "只能识别自己上传的任务图片");
    }
    if (!asset.storageKey.startsWith("task-checkin/")) {
      throw new DomainError("FORBIDDEN", "任务图片不属于当前应用存储范围");
    }
    if (asset.ownerScope.kind === "FAMILY") {
      await this.policy.requireFamilyRole(actor, asset.ownerScope.familyId);
    } else if (asset.ownerScope.kind === "ORGANIZATION") {
      await this.requireOrganizationTaskPublisher(actor, asset.ownerScope.organizationId);
    } else {
      throw new DomainError("FORBIDDEN", "当前空间不支持任务图片识别");
    }
    return asset;
  }

  private async requireOrganizationTaskPublisher(
    actor: ActorContext,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.policy.requireOrganizationRole(actor, organizationId, ["ORGANIZATION_ADMIN"]);
      return;
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "FORBIDDEN") throw error;
    }
    const bindings = await this.dependencies.repository.query("groupRoleBindings", {
      accountId: actor.accountId,
      organizationId,
      status: "ACTIVE",
    });
    for (const binding of bindings) {
      if (binding.role !== "TEACHER" && binding.role !== "ASSISTANT") continue;
      const group = await this.dependencies.repository.read("groups", binding.groupId);
      if (group?.status === "ACTIVE" && group.organizationId === organizationId) return;
    }
    throw new DomainError("FORBIDDEN", "当前账号没有有效的任务发布权限");
  }
}

interface NormalizedRecognizedTaskFields {
  readonly category?: TaskCategory;
  readonly confidence: number;
  readonly description?: string;
  readonly dueAt?: string;
  readonly provider: string;
  readonly providerVersion: string;
  readonly submissionMode?: SubmissionMode;
  readonly startsAt?: string;
  readonly title?: string;
}

function normalizeRecognizedFields(result: RecognizedTaskFields): NormalizedRecognizedTaskFields {
  const description = nonEmpty(result.description);
  const category = normalizeCategory(result.category);
  const dueAt = nonEmpty(result.dueAt);
  const startsAt = nonEmpty(result.startsAt);
  const submissionMode = normalizeSubmissionMode(result.submissionMode);
  const title = nonEmpty(result.title);
  return {
    ...(description === undefined ? {} : { description }),
    ...(category === undefined ? {} : { category }),
    confidence: Number.isFinite(result.confidence) ? Math.min(1, Math.max(0, result.confidence)) : 0,
    ...(dueAt === undefined ? {} : { dueAt }),
    provider: safeProviderValue(result.provider, "unknown"),
    providerVersion: safeProviderValue(result.providerVersion, "unknown"),
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(submissionMode === undefined ? {} : { submissionMode }),
    ...(title === undefined ? {} : { title }),
  };
}

function normalizeSubmissionMode(value: string | undefined): SubmissionMode | undefined {
  const normalized = value?.trim().toUpperCase();
  return ["CONFIRM", "TEXT", "PHOTO", "TEXT_AND_PHOTO"].includes(normalized ?? "")
    ? (normalized as SubmissionMode)
    : undefined;
}

function normalizeCategory(value: string | undefined): TaskCategory | undefined {
  const normalized = value?.trim().toUpperCase();
  return ["LIFE", "LANGUAGE", "MATHEMATICS", "ENGLISH", "SCIENCE", "ART", "SPORT", "OTHER"].includes(
    normalized ?? "",
  )
    ? (normalized as TaskCategory)
    : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === "" || normalized === undefined ? undefined : normalized;
}

function safeProviderValue(value: string, fallback: string): string {
  const normalized = value.trim().slice(0, 120);
  return normalized === "" ? fallback : normalized;
}

function recognizedFieldCount(fields: NormalizedRecognizedTaskFields): number {
  return [fields.title, fields.description, fields.category, fields.startsAt, fields.dueAt].filter(
    (value) => value !== undefined,
  ).length;
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
