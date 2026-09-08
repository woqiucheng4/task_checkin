import type { ApplicationDependencies, MediaStorage, OcrProvider, Transaction } from "./ports.js";
import { TaskService } from "./task-service.js";
import type {
  ActorContext,
  MediaAsset,
  SubmissionEvidenceLink,
  Task,
  TaskCategory,
  TaskDraft,
  TaskImportance,
  TaskSchedule,
  SubmissionMode,
  TenantScope,
} from "../domain/model.js";
import { addDays, assertValidMediaInput } from "../domain/media.js";
import { AccessPolicy } from "../domain/policy.js";
import { DomainError } from "../shared/errors.js";

interface RequestBase {
  readonly requestId: string;
}

export interface UploadIntentResult {
  readonly asset: MediaAsset;
  readonly uploadUrl: string;
  readonly uploadUrlExpiresAt: string;
}

export class MediaService {
  private readonly policy: AccessPolicy;

  constructor(
    private readonly dependencies: ApplicationDependencies,
    private readonly storage: MediaStorage,
    private readonly ocr: OcrProvider,
  ) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async createUploadIntent(
    actor: ActorContext,
    input: RequestBase & {
      readonly purpose: MediaAsset["purpose"];
      readonly mimeType: string;
      readonly byteSize: number;
      readonly retentionDays: number;
      readonly ownerScope?: TenantScope;
      readonly assignmentId?: string;
    },
  ): Promise<UploadIntentResult> {
    requireRequestId(input.requestId);
    assertValidMediaInput(input);
    const ownerScope = await this.resolveUploadScope(actor, input);
    const now = this.dependencies.clock.now();
    const expiresAt = addDays(now, input.retentionDays);
    const uploadUrlExpiresAt = new Date(Date.parse(now) + 15 * 60 * 1000).toISOString();
    const storageKey = `task-checkin/${ownerScope.kind.toLowerCase()}/${this.dependencies.ids.next("asset")}`;
    const asset: MediaAsset = {
      id: this.dependencies.ids.next("media"),
      byteSize: input.byteSize,
      createdAt: now,
      expiresAt,
      mimeType: input.mimeType,
      ownerScope,
      purpose: input.purpose,
      status: "PENDING_UPLOAD",
      storageKey,
      updatedAt: now,
      uploaderAccountId: actor.accountId,
      visibleRoles:
        input.purpose === "SUBMISSION_EVIDENCE"
          ? ["GUARDIAN", "TEACHER", "ASSISTANT"]
          : ["ORGANIZATION_ADMIN", "TEACHER", "ASSISTANT"],
    };
    const uploadUrl = await this.storage.createUploadUrl(storageKey, uploadUrlExpiresAt);
    await this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("mediaAssets", asset);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "MEDIA_UPLOAD_INTENT_CREATED",
        ownerScope,
        asset.id,
      );
    });
    return { asset, uploadUrl, uploadUrlExpiresAt };
  }

  async uploadContent(
    actor: ActorContext,
    input: RequestBase & { readonly assetId: string; readonly base64: string },
  ): Promise<MediaAsset> {
    requireRequestId(input.requestId);
    const asset = await this.requireUploader(actor, input.assetId);
    if (!this.storage.upload || !asset.storageKey.startsWith("task-checkin/")) {
      throw new DomainError("FORBIDDEN", "当前存储不允许此上传方式");
    }
    if (asset.status === "ACTIVE" && asset.fileId) return asset;
    if (
      asset.status !== "PENDING_UPLOAD" ||
      Date.parse(asset.expiresAt) <= Date.parse(this.dependencies.clock.now())
    ) {
      throw new DomainError("CONFLICT", "上传申请无效或已过期");
    }
    if (
      typeof input.base64 !== "string" ||
      input.base64.length > 1_400_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)
    ) {
      throw new DomainError("INVALID_INPUT", "请选择小于 1 MB 的有效图片");
    }
    const content = Buffer.from(input.base64, "base64");
    const mimeType =
      content[0] === 255 && content[1] === 216 && content[2] === 255
        ? "image/jpeg"
        : content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : content.toString("ascii", 0, 4) === "RIFF" &&
              content.toString("ascii", 8, 12) === "WEBP"
            ? "image/webp"
            : "";
    if (
      content.length !== asset.byteSize ||
      content.length > 1_000_000 ||
      mimeType !== asset.mimeType ||
      content.toString("base64") !== input.base64
    ) {
      throw new DomainError("INVALID_INPUT", "图片格式或大小与上传申请不一致");
    }
    const fileId = await this.storage.upload(asset.storageKey, content);
    if (!fileId.startsWith("cloud://"))
      throw new DomainError("CONFLICT", "云存储未返回有效文件 ID");
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const active = await tx.update("mediaAssets", asset.id, {
        fileId,
        status: "ACTIVE",
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "MEDIA_UPLOAD_VERIFIED",
        asset.ownerScope,
        asset.id,
      );
      return active;
    });
  }

  async recordUpload(
    actor: ActorContext,
    input: RequestBase & {
      readonly assetId: string;
      readonly observedMimeType: string;
      readonly observedByteSize: number;
    },
  ): Promise<MediaAsset> {
    requireRequestId(input.requestId);
    if (this.storage.upload) throw new DomainError("FORBIDDEN", "必须上传实际文件，由服务端验证");
    const asset = await this.requireUploader(actor, input.assetId);
    if (asset.status !== "PENDING_UPLOAD") {
      throw new DomainError("CONFLICT", "图片上传状态无效");
    }
    if (input.observedMimeType !== asset.mimeType || input.observedByteSize !== asset.byteSize) {
      throw new DomainError("INVALID_INPUT", "上传文件与申请信息不一致");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const active = await tx.update("mediaAssets", asset.id, { status: "ACTIVE", updatedAt: now });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "MEDIA_UPLOAD_RECORDED",
        asset.ownerScope,
        asset.id,
      );
      return active;
    });
  }

  async recognizeTaskDraft(
    actor: ActorContext,
    input: RequestBase & { readonly assetId: string },
  ): Promise<TaskDraft> {
    requireRequestId(input.requestId);
    const asset = await this.requireReadableSourceAsset(actor, input.assetId);
    const result = await this.ocr.recognize(asset.storageKey);
    const now = this.dependencies.clock.now();
    const draft: TaskDraft = {
      id: this.dependencies.ids.next("task_draft"),
      confidence: result.confidence,
      createdAt: now,
      createdByAccountId: actor.accountId,
      ...(result.description === undefined ? {} : { description: result.description }),
      ...(result.dueAt === undefined ? {} : { dueAt: result.dueAt }),
      ownerScope: asset.ownerScope,
      provider: result.provider,
      providerVersion: result.providerVersion,
      sourceAssetId: asset.id,
      ...(result.startsAt === undefined ? {} : { startsAt: result.startsAt }),
      status: "DRAFT",
      ...(isTaskCategory(result.category) ? { category: result.category } : {}),
      ...(result.title === undefined ? {} : { title: result.title }),
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("taskDrafts", stripUndefined(draft));
      await this.audit(
        tx,
        actor,
        input.requestId,
        "TASK_DRAFT_RECOGNIZED",
        asset.ownerScope,
        draft.id,
      );
      return stripUndefined(draft);
    });
  }

  async editDraft(
    actor: ActorContext,
    input: RequestBase & {
      readonly draftId: string;
      readonly title?: string;
      readonly description?: string;
      readonly category?: TaskCategory;
      readonly startsAt?: string;
      readonly dueAt?: string;
      readonly submissionMode?: SubmissionMode;
    },
  ): Promise<TaskDraft> {
    requireRequestId(input.requestId);
    const draft = await this.requireDraftManager(actor, input.draftId);
    if (draft.status !== "DRAFT") {
      throw new DomainError("CONFLICT", "只有草稿状态可以编辑");
    }
    const now = this.dependencies.clock.now();
    const patch = stripUndefined({
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.description === undefined ? {} : { description: input.description.trim() }),
      ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
      ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt }),
      ...(input.submissionMode === undefined ? {} : { submissionMode: input.submissionMode }),
      ...(input.title === undefined ? {} : { title: input.title.trim() }),
      updatedAt: now,
    });
    return this.dependencies.repository.transaction(async (tx) => {
      const edited = await tx.update("taskDrafts", draft.id, patch);
      await this.audit(tx, actor, input.requestId, "TASK_DRAFT_EDITED", draft.ownerScope, draft.id);
      return edited;
    });
  }

  async publishDraft(
    actor: ActorContext,
    input: RequestBase & {
      readonly draftId: string;
      readonly groupId?: string;
      readonly familyId?: string;
      readonly childIds?: readonly string[];
      readonly importance: TaskImportance;
      readonly estimatedMinutes: number;
      readonly schedule: TaskSchedule;
      readonly occurrenceDate: string;
      readonly allowLateSubmission: boolean;
      readonly requiresAcademicReview: boolean;
    },
  ): Promise<Task> {
    requireRequestId(input.requestId);
    const draft = await this.requireDraftManager(actor, input.draftId);
    if (
      draft.status !== "DRAFT" ||
      draft.title === undefined ||
      draft.category === undefined ||
      draft.startsAt === undefined ||
      draft.dueAt === undefined ||
      draft.submissionMode === undefined
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "发布前必须确认标题、学科、开始时间、截止时间和提交方式",
      );
    }
    const fields = {
      allowLateSubmission: input.allowLateSubmission,
      category: draft.category,
      ...(draft.description === undefined ? {} : { description: draft.description }),
      dueAt: draft.dueAt,
      estimatedMinutes: input.estimatedMinutes,
      importance: input.importance,
      occurrenceDate: input.occurrenceDate,
      requestId: input.requestId,
      requiresAcademicReview: input.requiresAcademicReview,
      schedule: input.schedule,
      startsAt: draft.startsAt,
      submissionMode: draft.submissionMode,
      title: draft.title,
    };
    const tasks = new TaskService(this.dependencies);
    const task =
      input.groupId !== undefined
        ? await tasks.publishGroupTask(actor, { ...fields, groupId: input.groupId })
        : await tasks.publishFamilyTask(actor, {
            ...fields,
            childIds: input.childIds ?? [],
            familyId: input.familyId ?? "",
          });
    const now = this.dependencies.clock.now();
    await this.dependencies.repository.transaction(async (tx) => {
      await tx.update("tasks", task.id, { draftId: draft.id, updatedAt: now });
      await tx.update("taskDrafts", draft.id, { status: "PUBLISHED", updatedAt: now });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "TASK_DRAFT_PUBLISHED",
        draft.ownerScope,
        draft.id,
      );
    });
    return { ...task, draftId: draft.id, updatedAt: now };
  }

  async attachSubmissionEvidence(
    actor: ActorContext,
    input: RequestBase & { readonly submissionId: string; readonly assetId: string },
  ): Promise<SubmissionEvidenceLink> {
    requireRequestId(input.requestId);
    const submission = await this.dependencies.repository.read("submissions", input.submissionId);
    if (submission === undefined) {
      throw new DomainError("NOT_FOUND", "提交记录不存在");
    }
    await this.requireChildActor(actor, submission.childId);
    const asset = await this.requireUploader(actor, input.assetId);
    if (asset.status !== "ACTIVE" || asset.purpose !== "SUBMISSION_EVIDENCE") {
      throw new DomainError("INVALID_INPUT", "图片不是有效的作业证据");
    }
    const now = this.dependencies.clock.now();
    const link: SubmissionEvidenceLink = {
      id: this.dependencies.ids.next("submission_evidence"),
      assignmentId: submission.assignmentId,
      childId: submission.childId,
      createdAt: now,
      mediaAssetId: asset.id,
      requestId: input.requestId,
      submissionId: submission.id,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("submissionEvidenceLinks", link);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "SUBMISSION_EVIDENCE_ATTACHED",
        asset.ownerScope,
        link.id,
      );
      return link;
    });
  }

  async readAsset(
    actor: ActorContext,
    assetId: string,
  ): Promise<MediaAsset & { downloadUrl?: string }> {
    const asset = await this.authorizeReadableAsset(actor, assetId);
    if (asset.fileId && this.storage.downloadUrl) {
      return { ...asset, downloadUrl: await this.storage.downloadUrl(asset.fileId) };
    }
    return asset;
  }

  private async authorizeReadableAsset(actor: ActorContext, assetId: string): Promise<MediaAsset> {
    const asset = await this.dependencies.repository.read("mediaAssets", assetId);
    if (asset === undefined || asset.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "图片不存在或已删除");
    }
    if (asset.uploaderAccountId === actor.accountId) {
      return asset;
    }
    if (asset.purpose === "TASK_SOURCE") {
      await this.authorizeAdultScope(actor, asset.ownerScope);
      return asset;
    }
    const link = (
      await this.dependencies.repository.query("submissionEvidenceLinks", {
        mediaAssetId: asset.id,
      })
    )[0];
    if (link === undefined) {
      throw new DomainError("FORBIDDEN", "图片尚未关联有效提交");
    }
    const assignment = await this.dependencies.repository.read(
      "taskAssignments",
      link.assignmentId,
    );
    if (assignment === undefined) {
      throw new DomainError("FORBIDDEN", "图片关联的任务不存在");
    }
    try {
      await this.policy.requireGuardian(actor, assignment.childId);
      return asset;
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "FORBIDDEN") {
        throw error;
      }
    }
    if (assignment.groupId !== undefined && assignment.organizationId !== undefined) {
      const memberships = await this.dependencies.repository.query("childGroupMemberships", {
        childId: assignment.childId,
        groupId: assignment.groupId,
        status: "ACTIVE",
      });
      if (!memberships.length)
        throw new DomainError("FORBIDDEN", "孩子已退出分组，不能读取作业图片");
      await this.authorizeGroupReviewer(actor, assignment.groupId, assignment.organizationId);
      return asset;
    }
    throw new DomainError("FORBIDDEN", "当前账号不能读取该图片");
  }

  async deleteExpiredAssets(
    actor: ActorContext,
    input: RequestBase,
  ): Promise<{ readonly deletedCount: number }> {
    requireRequestId(input.requestId);
    if (actor.mode !== "PLATFORM") {
      throw new DomainError("FORBIDDEN", "只有系统任务可以清理过期图片");
    }
    const now = this.dependencies.clock.now();
    const assets = await this.dependencies.repository.query(
      "mediaAssets",
      (asset) => asset.status === "ACTIVE" && Date.parse(asset.expiresAt) < Date.parse(now),
    );
    let deletedCount = 0;
    for (const asset of assets) {
      await this.storage.delete(asset.fileId ?? asset.storageKey);
      await this.dependencies.repository.transaction(async (tx) => {
        await tx.update("mediaAssets", asset.id, {
          deletedAt: now,
          status: "DELETED",
          updatedAt: now,
        });
        await this.audit(
          tx,
          actor,
          input.requestId,
          "MEDIA_EXPIRED_DELETED",
          asset.ownerScope,
          asset.id,
        );
      });
      deletedCount += 1;
    }
    return { deletedCount };
  }

  private async resolveUploadScope(
    actor: ActorContext,
    input: {
      readonly purpose: MediaAsset["purpose"];
      readonly ownerScope?: TenantScope;
      readonly assignmentId?: string;
    },
  ): Promise<TenantScope> {
    if (input.purpose === "SUBMISSION_EVIDENCE") {
      if (
        input.assignmentId === undefined ||
        actor.mode !== "CHILD" ||
        actor.childId === undefined
      ) {
        throw new DomainError("INVALID_INPUT", "作业证据必须关联孩子任务实例");
      }
      const assignment = await this.dependencies.repository.read(
        "taskAssignments",
        input.assignmentId,
      );
      if (assignment?.childId !== actor.childId) {
        throw new DomainError("FORBIDDEN", "作业证据不属于当前孩子任务");
      }
      await this.requireChildActor(actor, assignment.childId);
      return assignment.organizationId === undefined
        ? { kind: "FAMILY", familyId: assignment.familyId }
        : { kind: "ORGANIZATION", organizationId: assignment.organizationId };
    }
    if (input.ownerScope === undefined) {
      throw new DomainError("INVALID_INPUT", "任务图片必须指定所属空间");
    }
    await this.authorizeAdultScope(actor, input.ownerScope);
    return input.ownerScope;
  }

  private async requireUploader(actor: ActorContext, assetId: string): Promise<MediaAsset> {
    const asset = await this.dependencies.repository.read("mediaAssets", assetId);
    if (asset === undefined) {
      throw new DomainError("NOT_FOUND", "图片记录不存在");
    }
    if (asset.uploaderAccountId !== actor.accountId) {
      throw new DomainError("FORBIDDEN", "只能确认自己申请上传的图片");
    }
    return asset;
  }

  private async requireReadableSourceAsset(
    actor: ActorContext,
    assetId: string,
  ): Promise<MediaAsset> {
    const asset = await this.dependencies.repository.read("mediaAssets", assetId);
    if (asset?.status !== "ACTIVE" || asset.purpose !== "TASK_SOURCE") {
      throw new DomainError("NOT_FOUND", "任务图片不存在或不可识别");
    }
    await this.authorizeAdultScope(actor, asset.ownerScope);
    return asset;
  }

  private async requireDraftManager(actor: ActorContext, draftId: string): Promise<TaskDraft> {
    const draft = await this.dependencies.repository.read("taskDrafts", draftId);
    if (draft === undefined) {
      throw new DomainError("NOT_FOUND", "任务草稿不存在");
    }
    await this.authorizeAdultScope(actor, draft.ownerScope);
    return draft;
  }

  private async authorizeAdultScope(actor: ActorContext, scope: TenantScope): Promise<void> {
    if (actor.mode !== "ACCOUNT") {
      throw new DomainError("FORBIDDEN", "只有成人账号可以管理任务图片");
    }
    if (scope.kind === "FAMILY") {
      await this.policy.requireFamilyRole(actor, scope.familyId);
      return;
    }
    if (scope.kind === "ORGANIZATION") {
      await this.policy.requireOrganizationRole(actor, scope.organizationId);
      return;
    }
    throw new DomainError("FORBIDDEN", "当前空间不支持任务图片");
  }

  private async authorizeGroupReviewer(
    actor: ActorContext,
    groupId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.policy.requireOrganizationRole(actor, organizationId, ["ORGANIZATION_ADMIN"]);
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "FORBIDDEN") {
        throw error;
      }
      await this.policy.requireGroupRole(actor, groupId);
    }
  }

  private async requireChildActor(actor: ActorContext, childId: string): Promise<void> {
    if (actor.mode !== "CHILD" || actor.childId !== childId) {
      throw new DomainError("FORBIDDEN", "当前不是该孩子的操作身份");
    }
    await this.policy.requireGuardian(actor, childId);
  }

  private async audit(
    tx: Transaction,
    actor: ActorContext,
    requestId: string,
    action: string,
    tenantScope: TenantScope,
    resourceId: string,
  ): Promise<void> {
    await tx.appendAudit({
      id: this.dependencies.ids.next("audit"),
      action,
      actorAccountId: actor.accountId,
      createdAt: this.dependencies.clock.now(),
      metadata: {},
      requestId,
      resourceId,
      resourceType: action,
      tenantScope,
    });
  }
}

function isTaskCategory(value: string | undefined): value is TaskCategory {
  return [
    "LIFE",
    "LANGUAGE",
    "MATHEMATICS",
    "ENGLISH",
    "SCIENCE",
    "ART",
    "SPORT",
    "OTHER",
  ].includes(value ?? "");
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
