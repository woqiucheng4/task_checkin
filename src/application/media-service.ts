import type {
  ApplicationDependencies,
  MediaStorage,
  TaskDraftProvider,
  ReadRepository,
  Transaction,
} from "./ports.js";
import { AiGateway } from "./ai-gateway.js";
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
  private readonly aiGateway: AiGateway;

  constructor(
    private readonly dependencies: ApplicationDependencies,
    private readonly storage: MediaStorage,
    gatewayOrProvider: AiGateway | TaskDraftProvider,
  ) {
    this.policy = new AccessPolicy(dependencies.repository);
    this.aiGateway =
      gatewayOrProvider instanceof AiGateway
        ? gatewayOrProvider
        : new AiGateway(dependencies, storage, gatewayOrProvider);
  }

  static async assertTaskSourceAssets(
    dependencies: { readonly repository: ReadRepository },
    actor: ActorContext,
    ownerScope: TenantScope,
    assetIds: unknown,
  ): Promise<readonly string[]> {
    const normalizedAssetIds = normalizeAssetIds(assetIds, "任务图片");
    for (const assetId of normalizedAssetIds) {
      const asset = await dependencies.repository.read("mediaAssets", assetId);
      if (
        asset?.status !== "ACTIVE" ||
        asset.purpose !== "TASK_SOURCE" ||
        asset.uploaderAccountId !== actor.accountId ||
        !asset.storageKey.startsWith("task-checkin/") ||
        !sameScope(asset.ownerScope, ownerScope)
      ) {
        throw new DomainError("FORBIDDEN", "任务图片不属于当前发布者或空间");
      }
    }
    return normalizedAssetIds;
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
    if (
      ["SUBMISSION_EVIDENCE", "TASK_SOURCE"].includes(input.purpose) &&
      input.retentionDays !== 90
    ) {
      throw new DomainError("INVALID_INPUT", "任务图片和作业证据必须保存 90 天");
    }
    const now = this.dependencies.clock.now();
    const expiresAt = addDays(now, input.retentionDays);
    const uploadUrlExpiresAt = new Date(Date.parse(now) + 15 * 60 * 1000).toISOString();
    const storageKey = `task-checkin/${ownerScope.kind.toLowerCase()}/${this.dependencies.ids.next("asset")}`;
    const asset: MediaAsset = {
      uploadRequestId: input.requestId,
      id: this.dependencies.ids.next("media"),
      ...(input.purpose === "SUBMISSION_EVIDENCE" ? { assignmentId: input.assignmentId } : {}),
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
    const persisted = await this.dependencies.repository.transaction(async (tx) => {
      await this.resolveUploadScope(actor, input, tx);
      const repeated = (
        await tx.query("mediaAssets", {
          uploaderAccountId: actor.accountId,
          uploadRequestId: input.requestId,
          purpose: input.purpose,
        })
      ).find(
        (candidate) =>
          candidate.assignmentId === asset.assignmentId &&
          sameScope(candidate.ownerScope, ownerScope),
      );
      if (repeated) return repeated;
      await tx.insert("mediaAssets", asset);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "MEDIA_UPLOAD_INTENT_CREATED",
        ownerScope,
        asset.id,
      );
      return asset;
    });
    if (persisted.status !== "PENDING_UPLOAD" && persisted.status !== "ACTIVE")
      throw new DomainError("CONFLICT", "上传申请已失效");
    const uploadUrl = await this.storage.createUploadUrl(persisted.storageKey, uploadUrlExpiresAt);
    return { asset: persisted, uploadUrl, uploadUrlExpiresAt };
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
    // Claim before storage I/O: cleanup and a second uploader must not race the
    // same physical key while its file ID is still unknown.
    const claimed = await this.dependencies.repository.transaction(async (tx) => {
      const current = await this.requireUploader(actor, asset.id, tx);
      if (current.status === "ACTIVE" && current.fileId) return current;
      if (current.status !== "PENDING_UPLOAD")
        throw new DomainError("CONFLICT", "图片正在上传或申请已失效");
      return tx.update("mediaAssets", asset.id, {
        status: "UPLOADING",
        uploadConfirmationRequestId: input.requestId,
        updatedAt: this.dependencies.clock.now(),
      });
    });
    if (claimed.status === "ACTIVE") return claimed;
    const fileId = await this.storage.upload(asset.storageKey, content);
    if (!fileId.startsWith("cloud://"))
      throw new DomainError("CONFLICT", "云存储未返回有效文件 ID");
    const now = this.dependencies.clock.now();
    // Durably account for the private object independently of caller authority.
    // A denied/failed activation leaves a non-readable, reclaimable quarantine.
    await this.stageUploadedFile(asset.id, input.requestId, fileId, now);
    return this.dependencies.repository.transaction(async (tx) => {
      const current = await this.requireUploader(actor, asset.id, tx);
      if (current.status === "ACTIVE" && current.fileId) return current;
      if (
        current.status !== "QUARANTINED" ||
        current.uploadConfirmationRequestId !== input.requestId ||
        current.fileId !== fileId
      )
        throw new DomainError("CONFLICT", "上传申请已失效");
      const active = await tx.update("mediaAssets", asset.id, {
        fileId,
        status: "ACTIVE",
        uploadedAt: now,
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

  private async stageUploadedFile(
    assetId: string,
    requestId: string,
    fileId: string,
    now: string,
  ): Promise<void> {
    // Retry a transient write/commit-response failure without uploading again.
    // If persistence remains unavailable, UPLOADING stays fail-closed and is
    // never declared physically deleted by the metadata-only cleanup branch.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.dependencies.repository.transaction(async (tx) => {
          const current = await tx.read("mediaAssets", assetId);
          if (
            current?.uploadConfirmationRequestId !== requestId ||
            !["UPLOADING", "QUARANTINED", "ACTIVE"].includes(current.status)
          )
            throw new DomainError("CONFLICT", "上传申请已失效");
          if (current.fileId === fileId && current.status !== "UPLOADING") return;
          if (current.status !== "UPLOADING") throw new DomainError("CONFLICT", "上传文件不匹配");
          await tx.update("mediaAssets", assetId, {
            fileId,
            status: "QUARANTINED",
            uploadedAt: now,
            updatedAt: now,
          });
        });
        return;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
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
    if (
      asset.status === "ACTIVE" &&
      asset.uploadConfirmationRequestId === input.requestId &&
      input.observedMimeType === asset.mimeType &&
      input.observedByteSize === asset.byteSize
    )
      return asset;
    if (asset.status !== "PENDING_UPLOAD") {
      throw new DomainError("CONFLICT", "图片上传状态无效");
    }
    if (input.observedMimeType !== asset.mimeType || input.observedByteSize !== asset.byteSize) {
      throw new DomainError("INVALID_INPUT", "上传文件与申请信息不一致");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const current = await this.requireUploader(actor, asset.id, tx);
      if (current.status === "ACTIVE" && current.uploadConfirmationRequestId === input.requestId)
        return current;
      if (current.status !== "PENDING_UPLOAD") throw new DomainError("CONFLICT", "上传申请已失效");
      const active = await tx.update("mediaAssets", asset.id, {
        status: "ACTIVE",
        uploadConfirmationRequestId: input.requestId,
        uploadedAt: now,
        updatedAt: now,
      });
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
    return this.aiGateway.generateTaskDraft(actor, input);
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
      const draft = await this.requireDraftManager(actor, input.draftId, tx);
      if (draft.status !== "DRAFT") {
        throw new DomainError("CONFLICT", "只有草稿状态可以编辑");
      }
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
      readonly sourceAssetIds?: readonly string[];
    },
  ): Promise<Task> {
    requireRequestId(input.requestId);
    return this.dependencies.repository.transaction(async (tx) => {
      // All nested service operations share this transaction, including its reads.
      const dependencies: ApplicationDependencies = {
        ...this.dependencies,
        repository: {
          read: tx.read.bind(tx),
          query: tx.query.bind(tx),
          transaction: (work) => work(tx),
        },
      };
      const draft = await this.requireDraftManager(actor, input.draftId, tx);
      if (draft.status === "PUBLISHED") {
        const published = (await tx.query("tasks", { draftId: draft.id }))[0];
        if (published) return published;
        throw new DomainError("CONFLICT", "已发布草稿缺少对应任务");
      }
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
      const sourceAssetIds = await MediaService.assertTaskSourceAssets(
        dependencies,
        actor,
        draft.ownerScope,
        input.sourceAssetIds ?? [draft.sourceAssetId],
      );
      if (!sourceAssetIds.includes(draft.sourceAssetId)) {
        throw new DomainError("INVALID_INPUT", "草稿识别图片必须保留在任务图片中");
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
        sourceAssetIds,
        startsAt: draft.startsAt,
        submissionMode: draft.submissionMode,
        title: draft.title,
      };
      const tasks = new TaskService(dependencies);
      const task =
        input.groupId !== undefined
          ? await tasks.publishGroupTask(actor, { ...fields, groupId: input.groupId })
          : await tasks.publishFamilyTask(actor, {
              ...fields,
              childIds: input.childIds ?? [],
              familyId: input.familyId ?? "",
            });
      const now = this.dependencies.clock.now();
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
      return { ...task, draftId: draft.id, updatedAt: now };
    });
  }

  async attachSubmissionEvidence(
    actor: ActorContext,
    input: RequestBase & { readonly submissionId: string; readonly assetId: string },
  ): Promise<SubmissionEvidenceLink> {
    requireRequestId(input.requestId);
    const assetId = requireNonBlankString(input.assetId, "图片 ID");
    const submission = await this.dependencies.repository.read("submissions", input.submissionId);
    if (submission === undefined) {
      throw new DomainError("NOT_FOUND", "提交记录不存在");
    }
    await this.requireChildActor(actor, submission.childId);
    return this.dependencies.repository.transaction(async (tx) => {
      const currentSubmission = await tx.read("submissions", submission.id);
      const assignment = await tx.read("taskAssignments", submission.assignmentId);
      await new AccessPolicy(tx).requireGuardian(actor, submission.childId);
      const asset = await tx.read("mediaAssets", assetId);
      const links = await tx.query("submissionEvidenceLinks", { submissionId: submission.id });
      if (
        currentSubmission === undefined ||
        assignment === undefined ||
        asset === undefined ||
        asset.status !== "ACTIVE" ||
        asset.purpose !== "SUBMISSION_EVIDENCE" ||
        asset.uploaderAccountId !== actor.accountId ||
        asset.assignmentId !== submission.assignmentId ||
        !isAssignmentScope(asset.ownerScope, assignment) ||
        !asset.storageKey.startsWith("task-checkin/")
      ) {
        throw new DomainError("FORBIDDEN", "图片未上传完成或不属于当前任务实例");
      }
      const existing = links.find((link) => link.mediaAssetId === asset.id);
      if (existing !== undefined) return existing;
      if (links.length >= 3) {
        throw new DomainError("INVALID_INPUT", "一次提交最多附加三张图片");
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
    if (asset.purpose === "SUBMISSION_EVIDENCE" && actor.mode !== "ACCOUNT") {
      throw new DomainError("FORBIDDEN", "当前身份不能读取作业图片");
    }
    if (asset.purpose === "TASK_SOURCE") {
      const tasks = await this.dependencies.repository.query(
        "tasks",
        (task) => task.sourceAssetIds?.includes(asset.id) === true,
      );
      if (
        tasks.length === 0 &&
        actor.mode === "ACCOUNT" &&
        asset.uploaderAccountId === actor.accountId
      ) {
        await this.authorizeAdultScope(actor, asset.ownerScope);
        return asset;
      }
      for (const task of tasks) {
        const assignments = await this.dependencies.repository.query("taskAssignments", {
          taskId: task.id,
        });
        for (const assignment of assignments) {
          try {
            if (actor.mode === "CHILD") {
              await this.requireChildActor(actor, assignment.childId);
              return asset;
            }
            if (actor.mode !== "ACCOUNT") continue;
            try {
              await this.policy.requireGuardian(actor, assignment.childId);
              return asset;
            } catch (error) {
              if (!(error instanceof DomainError) || error.code !== "FORBIDDEN") throw error;
            }
            if (!assignment.groupId || !assignment.organizationId) continue;
            const group = await this.dependencies.repository.read("groups", assignment.groupId);
            const organization = await this.dependencies.repository.read(
              "organizations",
              assignment.organizationId,
            );
            if (
              group?.status !== "ACTIVE" ||
              group.organizationId !== assignment.organizationId ||
              organization?.status !== "ACTIVE"
            )
              continue;
            await this.policy.requireOrganizationRole(actor, assignment.organizationId);
            const memberships = await this.dependencies.repository.query("childGroupMemberships", {
              childId: assignment.childId,
              groupId: assignment.groupId,
              status: "ACTIVE",
            });
            if (!memberships.length || !assignment.organizationMemberId) continue;
            const members = await this.dependencies.repository.query("organizationMembers", {
              organizationMemberId: assignment.organizationMemberId,
              organizationId: assignment.organizationId,
              childId: assignment.childId,
              memberType: "CHILD",
              status: "ACTIVE",
            });
            if (!members.length) continue;
            await this.authorizeGroupReviewer(actor, assignment.groupId, assignment.organizationId);
            return asset;
          } catch (error) {
            if (!(error instanceof DomainError) || error.code !== "FORBIDDEN") throw error;
          }
        }
      }
      throw new DomainError("FORBIDDEN", "当前身份不能读取该任务图片");
    }
    if (
      actor.mode === "ACCOUNT" &&
      asset.uploaderAccountId === actor.accountId &&
      asset.purpose !== "SUBMISSION_EVIDENCE"
    ) {
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
      if (!assignment.organizationMemberId)
        throw new DomainError("FORBIDDEN", "孩子机构授权已失效");
      const member = (
        await this.dependencies.repository.query("organizationMembers", {
          organizationId: assignment.organizationId,
          organizationMemberId: assignment.organizationMemberId,
          childId: assignment.childId,
          memberType: "CHILD",
          status: "ACTIVE",
        })
      )[0];
      if (!member) throw new DomainError("FORBIDDEN", "孩子机构授权已失效");
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
      (asset) =>
        (asset.status === "ACTIVE" &&
          (asset.purpose === "TASK_SOURCE" || Date.parse(asset.expiresAt) < Date.parse(now))) ||
        (asset.status === "PENDING_UPLOAD" &&
          ["TASK_SOURCE", "SUBMISSION_EVIDENCE"].includes(asset.purpose)) ||
        asset.status === "QUARANTINED" ||
        asset.status === "DELETING",
    );
    let deletedCount = 0;
    for (const asset of assets) {
      const claimed = await this.dependencies.repository.transaction(async (tx) => {
        const current = await tx.read("mediaAssets", asset.id);
        if (!current || current.status === "DELETED" || current.status === "UPLOADING")
          return undefined;
        if (current.status === "DELETING") return current;
        let expiresAt = current.expiresAt;
        if (current.status === "QUARANTINED") {
          // An intent's assignment is not a committed submission reference.
          // Quarantined uploads may be reclaimed after timeout, but preserve
          // any actual reference conservatively rather than deleting live work.
          if (await this.hasMediaReferences(tx, current.id)) return undefined;
          expiresAt = addDays(current.uploadedAt ?? current.createdAt, 90);
        } else if (["TASK_SOURCE", "SUBMISSION_EVIDENCE"].includes(current.purpose)) {
          expiresAt = addDays(current.uploadedAt ?? current.createdAt, 90);
          const tasks = await tx.query(
            "tasks",
            (task) => task.sourceAssetIds?.includes(current.id) === true,
          );
          const relatedAssignments = [];
          for (const task of tasks) {
            const assignments = await tx.query("taskAssignments", { taskId: task.id });
            if (!assignments.length) return undefined;
            relatedAssignments.push(...assignments);
          }
          const evidenceLinks = await tx.query("submissionEvidenceLinks", {
            mediaAssetId: current.id,
          });
          const assignmentIds = new Set(evidenceLinks.map((link) => link.assignmentId));
          if (current.assignmentId) assignmentIds.add(current.assignmentId);
          for (const assignmentId of assignmentIds) {
            const assignment = await tx.read("taskAssignments", assignmentId);
            if (!assignment) return undefined;
            relatedAssignments.push(assignment);
          }
          for (const assignment of relatedAssignments) {
            if (!["COMPLETED", "EXCUSED", "CANCELLED", "EXPIRED"].includes(assignment.taskState))
              return undefined;
            const completedExpiry = addDays(assignment.updatedAt, 90);
            if (completedExpiry > expiresAt) expiresAt = completedExpiry;
          }
        }
        if (Date.parse(expiresAt) >= Date.parse(now)) return undefined;
        if (current.status === "PENDING_UPLOAD" && !current.fileId) {
          const expired = await tx.update("mediaAssets", current.id, {
            expiresAt,
            status: "DELETED",
            deletedAt: now,
            updatedAt: now,
          });
          await this.audit(
            tx,
            actor,
            input.requestId,
            "MEDIA_EXPIRED_DELETED",
            current.ownerScope,
            current.id,
          );
          return expired;
        }
        // Commit the claim before touching storage so a transaction retry cannot
        // delete an image that another publication just attached.
        return tx.update("mediaAssets", asset.id, {
          expiresAt,
          status: "DELETING",
          updatedAt: now,
        });
      });
      if (!claimed) continue;
      if (claimed.status === "DELETED") {
        deletedCount += 1;
        continue;
      }
      await this.storage.delete(claimed.fileId ?? claimed.storageKey);
      const deleted = await this.dependencies.repository.transaction(async (tx) => {
        const current = await tx.read("mediaAssets", claimed.id);
        if (current?.status !== "DELETING") return false;
        await tx.update("mediaAssets", claimed.id, {
          status: "DELETED",
          deletedAt: now,
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
        return true;
      });
      if (deleted) deletedCount += 1;
    }
    return { deletedCount };
  }

  private async hasMediaReferences(repository: ReadRepository, assetId: string): Promise<boolean> {
    if ((await repository.query("submissionEvidenceLinks", { mediaAssetId: assetId })).length)
      return true;
    if (
      (
        await repository.query("submissions", (submission) =>
          submission.mediaAssetIds.includes(assetId),
        )
      ).length
    )
      return true;
    if (
      (await repository.query("tasks", (task) => task.sourceAssetIds?.includes(assetId) === true))
        .length
    )
      return true;
    return (await repository.query("taskDrafts", { sourceAssetId: assetId })).length > 0;
  }

  private async resolveUploadScope(
    actor: ActorContext,
    input: {
      readonly purpose: MediaAsset["purpose"];
      readonly ownerScope?: TenantScope;
      readonly assignmentId?: string;
    },
    repository: ReadRepository = this.dependencies.repository,
  ): Promise<TenantScope> {
    const policy = new AccessPolicy(repository);
    if (input.purpose === "SUBMISSION_EVIDENCE") {
      if (input.assignmentId === undefined) {
        throw new DomainError("INVALID_INPUT", "作业证据必须关联孩子任务实例");
      }
      const assignment = await repository.read("taskAssignments", input.assignmentId);
      if (
        !assignment ||
        (actor.mode !== "ACCOUNT" && actor.mode !== "CHILD") ||
        (actor.mode === "CHILD" && assignment.childId !== actor.childId)
      ) {
        throw new DomainError("FORBIDDEN", "作业证据不属于当前孩子任务");
      }
      const guardian = await policy.requireGuardian(actor, assignment.childId);
      const task = await repository.read("tasks", assignment.taskId);
      const family = await repository.read("families", assignment.familyId);
      if (family?.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "家庭已停用");
      if (
        guardian.familyId !== assignment.familyId ||
        task?.status !== "PUBLISHED" ||
        ["COMPLETED", "CANCELLED", "EXCUSED", "EXPIRED"].includes(assignment.taskState)
      )
        throw new DomainError("FORBIDDEN", "任务已失效，不能上传证据");
      if (assignment.groupId && assignment.organizationId) {
        const group = await repository.read("groups", assignment.groupId);
        const organization = await repository.read("organizations", assignment.organizationId);
        const memberships = await repository.query("childGroupMemberships", {
          childId: assignment.childId,
          groupId: assignment.groupId,
          organizationId: assignment.organizationId,
          status: "ACTIVE",
        });
        const members = await repository.query("organizationMembers", {
          childId: assignment.childId,
          organizationId: assignment.organizationId,
          memberType: "CHILD",
          status: "ACTIVE",
        });
        if (
          group?.status !== "ACTIVE" ||
          group.organizationId !== assignment.organizationId ||
          organization?.status !== "ACTIVE" ||
          !memberships.some(
            (membership) => membership.organizationMemberId === assignment.organizationMemberId,
          ) ||
          !members.some((member) => member.organizationMemberId === assignment.organizationMemberId)
        )
          throw new DomainError("FORBIDDEN", "孩子分组授权已失效");
      }
      return assignment.organizationId === undefined
        ? { kind: "FAMILY", familyId: assignment.familyId }
        : { kind: "ORGANIZATION", organizationId: assignment.organizationId };
    }
    if (input.ownerScope === undefined) {
      throw new DomainError("INVALID_INPUT", "任务图片必须指定所属空间");
    }
    await this.authorizeAdultScope(actor, input.ownerScope, repository);
    return input.ownerScope;
  }

  private async requireUploader(
    actor: ActorContext,
    assetId: string,
    repository: ReadRepository = this.dependencies.repository,
  ): Promise<MediaAsset> {
    const asset = await repository.read("mediaAssets", assetId);
    if (asset === undefined) {
      throw new DomainError("NOT_FOUND", "图片记录不存在");
    }
    if (asset.uploaderAccountId !== actor.accountId) {
      throw new DomainError("FORBIDDEN", "只能确认自己申请上传的图片");
    }
    const scope = await this.resolveUploadScope(actor, asset, repository);
    if (!sameScope(scope, asset.ownerScope))
      throw new DomainError("FORBIDDEN", "上传申请空间不匹配");
    return asset;
  }

  private async requireDraftManager(
    actor: ActorContext,
    draftId: string,
    repository: ReadRepository = this.dependencies.repository,
  ): Promise<TaskDraft> {
    const draft = await repository.read("taskDrafts", draftId);
    if (draft === undefined) {
      throw new DomainError("NOT_FOUND", "任务草稿不存在");
    }
    const source = await repository.read("mediaAssets", draft.sourceAssetId);
    if (
      actor.mode !== "ACCOUNT" ||
      draft.createdByAccountId !== actor.accountId ||
      source?.uploaderAccountId !== actor.accountId ||
      source.purpose !== "TASK_SOURCE" ||
      !sameScope(source.ownerScope, draft.ownerScope)
    ) {
      throw new DomainError("FORBIDDEN", "只有草稿创建者可以编辑或发布草稿");
    }
    await this.authorizeAdultScope(actor, draft.ownerScope, repository);
    return draft;
  }

  private async authorizeAdultScope(
    actor: ActorContext,
    scope: TenantScope,
    repository: ReadRepository = this.dependencies.repository,
  ): Promise<void> {
    const policy = new AccessPolicy(repository);
    if (actor.mode !== "ACCOUNT") {
      throw new DomainError("FORBIDDEN", "只有成人账号可以管理任务图片");
    }
    if (scope.kind === "FAMILY") {
      const family = await repository.read("families", scope.familyId);
      if (family?.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "家庭已停用");
      await policy.requireFamilyRole(actor, scope.familyId);
      return;
    }
    if (scope.kind === "ORGANIZATION") {
      const organization = await repository.read("organizations", scope.organizationId);
      if (organization?.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "机构已停用");
      const member = await policy.requireOrganizationRole(actor, scope.organizationId);
      if (member.organizationRole !== "ORGANIZATION_ADMIN") {
        const bindings = await repository.query("groupRoleBindings", {
          accountId: actor.accountId,
          organizationId: scope.organizationId,
          status: "ACTIVE",
        });
        let allowed = false;
        for (const binding of bindings) {
          const group = await repository.read("groups", binding.groupId);
          if (
            group?.status === "ACTIVE" &&
            group.organizationId === scope.organizationId &&
            ["TEACHER", "ASSISTANT"].includes(binding.role)
          )
            allowed = true;
        }
        if (!allowed) throw new DomainError("FORBIDDEN", "当前账号没有有效分组权限");
      }
      return;
    }
    throw new DomainError("FORBIDDEN", "当前空间不支持任务图片");
  }

  private async authorizeGroupReviewer(
    actor: ActorContext,
    groupId: string,
    organizationId: string,
  ): Promise<void> {
    const access = await this.policy.requireGroupAccess(actor, groupId);
    if (access.organizationId !== organizationId)
      throw new DomainError("FORBIDDEN", "任务机构不匹配");
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

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function sameScope(left: TenantScope, right: TenantScope): boolean {
  return (
    (left.kind === "FAMILY" && right.kind === "FAMILY" && left.familyId === right.familyId) ||
    (left.kind === "ORGANIZATION" &&
      right.kind === "ORGANIZATION" &&
      left.organizationId === right.organizationId)
  );
}

function normalizeAssetIds(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > 3 ||
    value.some((id) => typeof id !== "string" || id.trim().length === 0)
  ) {
    throw new DomainError("INVALID_INPUT", `${label}最多三张，且必须是有效图片 ID`);
  }
  const ids = value.map((id) => id.trim());
  if (new Set(ids).size !== ids.length) {
    throw new DomainError("INVALID_INPUT", `${label}不能重复`);
  }
  return ids;
}

function requireNonBlankString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError("INVALID_INPUT", `${label}不能为空`);
  }
  return value.trim();
}

function isAssignmentScope(
  scope: TenantScope,
  assignment: { familyId: string; organizationId?: string },
): boolean {
  return scope.kind === "FAMILY"
    ? assignment.organizationId === undefined && scope.familyId === assignment.familyId
    : scope.kind === "ORGANIZATION" && scope.organizationId === assignment.organizationId;
}
