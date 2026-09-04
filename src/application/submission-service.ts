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
    const { assignment, task } = await this.loadAssignment(input.assignmentId);
    await this.requireChildActor(actor, assignment.childId);
    if (assignment.taskState !== expectedState) {
      throw new DomainError("CONFLICT", "当前任务状态不能提交");
    }
    this.validateEvidence(task, input);
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
      mediaAssetIds: [...input.mediaAssetIds],
      requestId: input.requestId,
      revision: previous.length + 1,
      submittedAt: now,
      ...(input.text === undefined ? {} : { text: input.text.trim() }),
    };
    return this.dependencies.repository.transaction(async (tx) => {
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

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
