import type { ApplicationDependencies, Transaction } from "./ports.js";
import type {
  ActorContext,
  Submission,
  Task,
  TaskAssignment,
  TenantScope,
} from "../domain/model.js";
import { AccessPolicy } from "../domain/policy.js";
import { DomainError } from "../shared/errors.js";

interface RequestBase {
  readonly requestId: string;
}

interface SubmissionInput extends RequestBase {
  readonly assignmentId: string;
  readonly text?: string;
  readonly mediaAssetIds: readonly string[];
}

export interface SubmissionResult {
  readonly assignment: TaskAssignment;
  readonly submission: Submission;
}

export class SubmissionService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async submit(actor: ActorContext, input: SubmissionInput): Promise<SubmissionResult> {
    return this.createSubmission(actor, input, "PENDING");
  }

  async supplement(actor: ActorContext, input: SubmissionInput): Promise<SubmissionResult> {
    return this.createSubmission(actor, input, "REVISION_REQUIRED");
  }

  async detail(actor: ActorContext, assignmentId: string) {
    const { assignment, task } = await this.loadAssignment(assignmentId);
    let childLabel = "";
    let teacherAccess = false;
    if (actor.mode === "CHILD") {
      await this.requireChildActor(actor, assignment.childId);
    } else if (actor.mode === "ACCOUNT") {
      try {
        await this.policy.requireGuardian(actor, assignment.childId);
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "FORBIDDEN") throw error;
        if (!assignment.groupId || !assignment.organizationId) throw error;
        try {
          await this.policy.requireOrganizationRole(actor, assignment.organizationId, [
            "ORGANIZATION_ADMIN",
          ]);
        } catch (organizationError) {
          if (!(organizationError instanceof DomainError) || organizationError.code !== "FORBIDDEN")
            throw organizationError;
          await this.policy.requireGroupRole(actor, assignment.groupId);
        }
        const memberships = await this.dependencies.repository.query("childGroupMemberships", {
          childId: assignment.childId,
          groupId: assignment.groupId,
          status: "ACTIVE",
        });
        if (!memberships.length)
          throw new DomainError("FORBIDDEN", "孩子已退出分组，不能继续读取提交内容");
        const organizationMemberId = assignment.organizationMemberId;
        if (!organizationMemberId) throw new DomainError("FORBIDDEN", "机构成员不存在");
        const member = (
          await this.dependencies.repository.query("organizationMembers", {
            organizationId: assignment.organizationId,
            organizationMemberId,
            status: "ACTIVE",
          })
        )[0];
        if (!member) throw new DomainError("FORBIDDEN", "机构授权已失效");
        teacherAccess = true;
        childLabel = member.displayName;
      }
    } else throw new DomainError("FORBIDDEN", "当前身份不能读取孩子提交内容");
    if (!teacherAccess)
      childLabel =
        (await this.dependencies.repository.read("children", assignment.childId))?.nickname ||
        "孩子";
    const latest = (await this.dependencies.repository.query("submissions", { assignmentId })).sort(
      (a, b) => b.revision - a.revision,
    )[0];
    return {
      title: task.title,
      category: task.category,
      dueAt: task.dueAt,
      sourceAssetIds: task.sourceAssetIds ?? [],
      childLabel,
      source: task.source,
      description: task.description ?? "",
      submissionMode: task.submissionMode,
      taskState: assignment.taskState,
      academicState: assignment.academicState,
      rewardState: assignment.rewardState,
      ...(latest
        ? {
            submission: {
              id: latest.id,
              text: latest.text ?? "",
              mediaAssetIds: latest.mediaAssetIds,
              submittedAt: latest.submittedAt,
              revision: latest.revision,
            },
          }
        : {}),
    };
  }

  async markExcused(
    actor: ActorContext,
    input: RequestBase & { readonly assignmentId: string },
  ): Promise<TaskAssignment> {
    requireRequestId(input.requestId);
    const { assignment, task } = await this.loadAssignment(input.assignmentId);
    const guardian = await this.policy.requireGuardian(actor, assignment.childId);
    if (task.source !== "FAMILY" || guardian.familyId !== assignment.familyId) {
      throw new DomainError("FORBIDDEN", "家长只能免除本家庭发布的任务");
    }
    if (assignment.taskState !== "PENDING") {
      throw new DomainError("CONFLICT", "只有未提交任务可以免除");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const excused = await tx.update("taskAssignments", assignment.id, {
        academicState: "EXCUSED",
        rewardState: "WAIVED",
        taskState: "EXCUSED",
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "ASSIGNMENT_EXCUSED",
        task.sourceScope,
        assignment.id,
      );
      return excused;
    });
  }

  async acceptLateChallenge(
    actor: ActorContext,
    input: RequestBase & { readonly assignmentId: string },
  ): Promise<TaskAssignment> {
    requireRequestId(input.requestId);
    const { assignment, task } = await this.loadAssignment(input.assignmentId);
    await this.requireChildActor(actor, assignment.childId);
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const accepted = await tx.update("taskAssignments", assignment.id, {
        acceptedLateChallenge: true,
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "LATE_CHALLENGE_ACCEPTED",
        task.sourceScope,
        assignment.id,
      );
      return accepted;
    });
  }

  async expireUnsubmitted(
    actor: ActorContext,
    input: RequestBase,
  ): Promise<{ readonly expiredCount: number }> {
    requireRequestId(input.requestId);
    if (actor.mode !== "PLATFORM") {
      throw new DomainError("FORBIDDEN", "只有系统任务可以执行日终过期");
    }
    const now = this.dependencies.clock.now();
    const pending = await this.dependencies.repository.query("taskAssignments", {
      taskState: "PENDING",
    });
    let expiredCount = 0;
    for (const assignment of pending) {
      const task = await this.dependencies.repository.read("tasks", assignment.taskId);
      if (task === undefined || Date.parse(task.dueAt) >= Date.parse(now)) {
        continue;
      }
      await this.dependencies.repository.transaction(async (tx) => {
        const current = await tx.read("taskAssignments", assignment.id);
        if (current?.taskState !== "PENDING") {
          return;
        }
        await tx.update("taskAssignments", assignment.id, {
          publicPoolEventCreated: true,
          taskState: "EXPIRED",
          updatedAt: now,
        });
        if (!current.publicPoolEventCreated) {
          await tx.insert("publicPoolEvents", {
            id: this.dependencies.ids.next("public_pool_event"),
            assignmentId: assignment.id,
            childId: assignment.childId,
            createdAt: now,
            kind: "UNCLAIMED_SUNLIGHT_RETURNED",
          });
        }
        await this.audit(
          tx,
          actor,
          input.requestId,
          "ASSIGNMENT_EXPIRED",
          task.sourceScope,
          assignment.id,
        );
        expiredCount += 1;
      });
    }
    return { expiredCount };
  }

  private async createSubmission(
    actor: ActorContext,
    input: SubmissionInput,
    expectedState: "PENDING" | "REVISION_REQUIRED",
  ): Promise<SubmissionResult> {
    requireRequestId(input.requestId);
    const mediaAssetIds = normalizeMediaAssetIds(input.mediaAssetIds);
    const { assignment, task } = await this.loadAssignment(input.assignmentId);
    await this.requireChildActor(actor, assignment.childId);
    const repeated = (
      await this.dependencies.repository.query("submissions", {
        assignmentId: input.assignmentId,
        requestId: input.requestId,
      })
    )[0];
    if (repeated !== undefined) {
      const assignment = await this.dependencies.repository.read(
        "taskAssignments",
        input.assignmentId,
      );
      if (assignment === undefined) {
        throw new DomainError("CONFLICT", "提交记录缺少任务实例");
      }
      return { assignment, submission: repeated };
    }
    if (assignment.taskState !== expectedState) {
      throw new DomainError("CONFLICT", "当前任务状态不能提交");
    }
    this.validateEvidence(task, { ...input, mediaAssetIds });
    if (
      !task.allowLateSubmission &&
      Date.parse(this.dependencies.clock.now()) > Date.parse(task.dueAt)
    ) {
      throw new DomainError("CONFLICT", "任务已超过允许提交时间");
    }
    const previous = await this.dependencies.repository.query("submissions", {
      assignmentId: assignment.id,
    });
    const now = this.dependencies.clock.now();
    const submission: Submission = {
      id: this.dependencies.ids.next("submission"),
      assignmentId: assignment.id,
      childId: assignment.childId,
      createdAt: now,
      mediaAssetIds,
      requestId: input.requestId,
      revision: previous.length + 1,
      submittedAt: now,
      ...(input.text === undefined ? {} : { text: input.text.trim() }),
    };
    return this.dependencies.repository.transaction(async (tx) => {
      for (const assetId of mediaAssetIds) {
        const asset = await tx.read("mediaAssets", assetId);
        const inScope =
          asset?.ownerScope.kind === "FAMILY"
            ? assignment.organizationId === undefined &&
              asset.ownerScope.familyId === assignment.familyId
            : asset?.ownerScope.kind === "ORGANIZATION" &&
              asset.ownerScope.organizationId === assignment.organizationId;
        if (
          !asset ||
          !inScope ||
          asset.uploaderAccountId !== actor.accountId ||
          asset.assignmentId !== assignment.id ||
          asset.status !== "ACTIVE" ||
          asset.purpose !== "SUBMISSION_EVIDENCE" ||
          !asset.storageKey.startsWith("task-checkin/") ||
          Date.parse(asset.expiresAt) <= Date.parse(now)
        ) {
          throw new DomainError("FORBIDDEN", "图片未上传完成、已过期或不属于当前任务空间");
        }
        await tx.insert("submissionEvidenceLinks", {
          id: this.dependencies.ids.next("submission_evidence"),
          assignmentId: assignment.id,
          childId: assignment.childId,
          createdAt: now,
          mediaAssetId: asset.id,
          requestId: input.requestId,
          submissionId: submission.id,
        });
      }
      await tx.insert("submissions", submission);
      const updated = await tx.update("taskAssignments", assignment.id, {
        ...(expectedState === "REVISION_REQUIRED" && task.requiresAcademicReview
          ? { academicState: "PENDING" as const }
          : {}),
        rewardState: assignment.rewardState === "GRANTED" ? "GRANTED" : "PROTECTED",
        taskState: "SUBMITTED",
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "ASSIGNMENT_SUBMITTED",
        task.sourceScope,
        assignment.id,
      );
      return { assignment: updated, submission };
    });
  }

  private validateEvidence(task: Task, input: SubmissionInput): void {
    const hasText = input.text !== undefined && input.text.trim().length > 0;
    const hasPhoto = input.mediaAssetIds.length > 0;
    if (
      (task.submissionMode === "TEXT" && !hasText) ||
      (task.submissionMode === "PHOTO" && !hasPhoto) ||
      (task.submissionMode === "TEXT_AND_PHOTO" && (!hasText || !hasPhoto))
    ) {
      throw new DomainError("INVALID_INPUT", "提交材料不符合任务要求");
    }
  }

  private async requireChildActor(actor: ActorContext, childId: string): Promise<void> {
    if (actor.mode !== "CHILD" || actor.childId !== childId) {
      throw new DomainError("FORBIDDEN", "当前不是该孩子的操作身份");
    }
    await this.policy.requireGuardian(actor, childId);
  }

  private async loadAssignment(
    assignmentId: string,
  ): Promise<{ assignment: TaskAssignment; task: Task }> {
    const assignment = await this.dependencies.repository.read("taskAssignments", assignmentId);
    if (assignment === undefined) {
      throw new DomainError("NOT_FOUND", "任务实例不存在");
    }
    const task = await this.dependencies.repository.read("tasks", assignment.taskId);
    if (task?.status !== "PUBLISHED") {
      throw new DomainError("NOT_FOUND", "任务不存在或已取消");
    }
    return { assignment, task };
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

function normalizeMediaAssetIds(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > 3 ||
    value.some((id) => typeof id !== "string" || id.trim().length === 0)
  ) {
    throw new DomainError("INVALID_INPUT", "一次提交最多附加三张有效图片");
  }
  const ids = value.map((id) => id.trim());
  if (new Set(ids).size !== ids.length) {
    throw new DomainError("INVALID_INPUT", "同一图片不能重复提交");
  }
  return ids;
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
