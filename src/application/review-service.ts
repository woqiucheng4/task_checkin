import type { ApplicationDependencies, Transaction } from "./ports.js";
import type {
  ActorContext,
  Family,
  ReviewRecord,
  SunlightLedger,
  Task,
  TaskAssignment,
  TenantScope,
} from "../domain/model.js";
import { AccessPolicy } from "../domain/policy.js";
import { taskRewardAmount } from "../domain/rewards.js";
import { DomainError } from "../shared/errors.js";
import type { SunlightService } from "./sunlight-service.js";
import { GroupOrchardService } from "./group-orchard-service.js";

interface RequestBase {
  readonly requestId: string;
}

export interface ReviewResult {
  readonly assignment: TaskAssignment;
  readonly review: ReviewRecord;
  readonly ledger?: SunlightLedger;
}

export class ReviewService {
  private readonly policy: AccessPolicy;

  constructor(
    private readonly dependencies: ApplicationDependencies,
    private readonly sunlight: SunlightService,
  ) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async familyReview(
    actor: ActorContext,
    input: RequestBase & {
      readonly assignmentId: string;
      readonly decision: "APPROVE" | "REVISION_REQUIRED" | "EXCUSE" | "WAIVE";
      readonly note?: string;
    },
  ): Promise<ReviewResult> {
    requireRequestId(input.requestId);
    const repeated = await this.findRepeatedReview(actor, input, "FAMILY");
    if (repeated !== undefined) {
      return repeated;
    }
    const { assignment, task, family } = await this.loadContext(input.assignmentId);
    const guardian = await this.policy.requireGuardian(actor, assignment.childId);
    if (guardian.familyId !== assignment.familyId) {
      throw new DomainError("FORBIDDEN", "监护关系不属于任务家庭");
    }
    if (assignment.taskState !== "SUBMITTED") {
      throw new DomainError("CONFLICT", "只有已提交任务可以审核");
    }
    if (
      (input.decision === "EXCUSE" || input.decision === "REVISION_REQUIRED") &&
      task.source !== "FAMILY"
    ) {
      throw new DomainError("FORBIDDEN", "家长不能修改机构学习状态");
    }
    const now = this.dependencies.clock.now();
    const review = makeReview(
      this.dependencies.ids.next("review"),
      assignment.id,
      actor.accountId,
      input,
      "FAMILY",
      now,
    );

    return this.dependencies.repository.transaction(async (tx) => {
      let ledger: SunlightLedger | undefined;
      let patch: Parameters<Transaction["update"]>[2];
      if (input.decision === "APPROVE") {
        ledger = await this.sunlight.grantInTransaction(tx, actor.accountId, assignment.childId, {
          amount: taskRewardAmount(family, task, assignment),
          assignmentId: assignment.id,
          reason: "TASK_COMPLETED",
          requestId: input.requestId,
        });
        patch = {
          rewardState: "GRANTED",
          taskState:
            task.source === "FAMILY" || assignment.academicState === "APPROVED"
              ? "COMPLETED"
              : assignment.taskState,
          updatedAt: now,
        };
      } else if (input.decision === "REVISION_REQUIRED") {
        patch = { taskState: "REVISION_REQUIRED", updatedAt: now };
      } else if (input.decision === "EXCUSE") {
        patch = {
          academicState: "EXCUSED",
          rewardState: "WAIVED",
          taskState: "EXCUSED",
          updatedAt: now,
        };
      } else {
        patch = { rewardState: "WAIVED", updatedAt: now };
      }
      await tx.insert("reviewRecords", review);
      const updated = await tx.update("taskAssignments", assignment.id, patch);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "FAMILY_REVIEW_RECORDED",
        task.sourceScope,
        assignment.id,
      );
      return ledger === undefined
        ? { assignment: updated, review }
        : { assignment: updated, ledger, review };
    });
  }

  async academicReview(
    actor: ActorContext,
    input: RequestBase & {
      readonly assignmentId: string;
      readonly decision: "APPROVE" | "REVISION_REQUIRED" | "EXCUSE";
      readonly note?: string;
    },
  ): Promise<ReviewResult> {
    return this.performAcademicReview(actor, input, false);
  }

  async completeRevision(
    actor: ActorContext,
    input: RequestBase & { readonly assignmentId: string; readonly note?: string },
  ): Promise<ReviewResult> {
    const priorRevisions = await this.dependencies.repository.query("reviewRecords", {
      assignmentId: input.assignmentId,
      decision: "REVISION_REQUIRED",
      reviewType: "ACADEMIC",
    });
    if (priorRevisions.length === 0) {
      throw new DomainError("CONFLICT", "任务没有待完成的教师订正要求");
    }
    return this.performAcademicReview(
      actor,
      {
        assignmentId: input.assignmentId,
        decision: "APPROVE",
        ...(input.note === undefined ? {} : { note: input.note }),
        requestId: input.requestId,
      },
      true,
    );
  }

  private async performAcademicReview(
    actor: ActorContext,
    input: RequestBase & {
      readonly assignmentId: string;
      readonly decision: "APPROVE" | "REVISION_REQUIRED" | "EXCUSE";
      readonly note?: string;
    },
    revisionCompleted: boolean,
  ): Promise<ReviewResult> {
    requireRequestId(input.requestId);
    const repeated = await this.findRepeatedReview(actor, input, "ACADEMIC");
    if (repeated !== undefined) {
      return repeated;
    }
    const { assignment, task, family } = await this.loadContext(input.assignmentId);
    if (
      task.source === "FAMILY" ||
      task.groupId === undefined ||
      assignment.organizationId === undefined
    ) {
      throw new DomainError("FORBIDDEN", "家庭任务没有机构学习审核");
    }
    await this.requireInstitutionReviewer(actor, task.groupId, assignment.organizationId);
    if (assignment.taskState !== "SUBMITTED") {
      throw new DomainError("CONFLICT", "只有已提交任务可以进行学习审核");
    }
    const now = this.dependencies.clock.now();
    const review = makeReview(
      this.dependencies.ids.next("review"),
      assignment.id,
      actor.accountId,
      input,
      "ACADEMIC",
      now,
    );

    return this.dependencies.repository.transaction(async (tx) => {
      let ledger: SunlightLedger | undefined;
      let patch: Parameters<Transaction["update"]>[2];
      if (input.decision === "APPROVE") {
        let rewardState = assignment.rewardState;
        if (assignment.rewardState !== "GRANTED") {
          if (family.autoRewardInstitutionTasks) {
            ledger = await this.sunlight.grantInTransaction(
              tx,
              actor.accountId,
              assignment.childId,
              {
                amount: taskRewardAmount(family, task, assignment),
                assignmentId: assignment.id,
                reason: "TASK_COMPLETED",
                requestId: input.requestId,
              },
            );
            rewardState = "GRANTED";
          } else {
            rewardState = "PENDING_CONFIRMATION";
          }
        }
        if (revisionCompleted && assignment.rewardState === "GRANTED") {
          ledger = await this.sunlight.grantInTransaction(tx, actor.accountId, assignment.childId, {
            amount: family.defaultRewards.revision,
            assignmentId: assignment.id,
            reason: "REVISION_COMPLETED",
            referenceId: `${assignment.id}:revision:${review.id}`,
            requestId: input.requestId,
          });
        }
        patch = {
          academicState: "APPROVED",
          rewardState,
          taskState: "COMPLETED",
          updatedAt: now,
        };
      } else if (input.decision === "REVISION_REQUIRED") {
        patch = {
          academicState: "REVISION_REQUIRED",
          taskState: "REVISION_REQUIRED",
          updatedAt: now,
        };
      } else {
        patch = {
          academicState: "EXCUSED",
          rewardState: assignment.rewardState === "GRANTED" ? "GRANTED" : "WAIVED",
          taskState: "EXCUSED",
          updatedAt: now,
        };
      }
      await tx.insert("reviewRecords", review);
      if (input.decision === "APPROVE") {
        await new GroupOrchardService(this.dependencies).contributeForAcademicApproval(
          tx,
          assignment,
        );
      }
      const updated = await tx.update("taskAssignments", assignment.id, patch);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "ACADEMIC_REVIEW_RECORDED",
        task.sourceScope,
        assignment.id,
      );
      return ledger === undefined
        ? { assignment: updated, review }
        : { assignment: updated, ledger, review };
    });
  }

  private async findRepeatedReview(
    actor: ActorContext,
    input: { readonly assignmentId: string; readonly requestId: string },
    reviewType: ReviewRecord["reviewType"],
  ): Promise<ReviewResult | undefined> {
    const review = (
      await this.dependencies.repository.query("reviewRecords", {
        assignmentId: input.assignmentId,
        requestId: input.requestId,
        reviewType,
        reviewerAccountId: actor.accountId,
      })
    )[0];
    if (review === undefined) {
      return undefined;
    }
    const assignment = await this.dependencies.repository.read(
      "taskAssignments",
      input.assignmentId,
    );
    if (assignment === undefined) {
      throw new DomainError("CONFLICT", "审核记录缺少任务实例");
    }
    const ledgers = await this.dependencies.repository.query(
      "sunlightLedgers",
      (candidate) =>
        candidate.requestId === input.requestId &&
        (candidate.referenceId === input.assignmentId ||
          candidate.referenceId.startsWith(`${input.assignmentId}:`)),
    );
    return ledgers[0] === undefined
      ? { assignment, review }
      : { assignment, ledger: ledgers[0], review };
  }

  private async loadContext(
    assignmentId: string,
  ): Promise<{ assignment: TaskAssignment; task: Task; family: Family }> {
    const assignment = await this.dependencies.repository.read("taskAssignments", assignmentId);
    if (assignment === undefined) {
      throw new DomainError("NOT_FOUND", "任务实例不存在");
    }
    const task = await this.dependencies.repository.read("tasks", assignment.taskId);
    const family = await this.dependencies.repository.read("families", assignment.familyId);
    if (task?.status !== "PUBLISHED" || family?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "任务或家庭不存在");
    }
    return { assignment, family, task };
  }

  private async requireInstitutionReviewer(
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

function makeReview(
  id: string,
  assignmentId: string,
  reviewerAccountId: string,
  input: { readonly decision: string; readonly note?: string; readonly requestId: string },
  reviewType: ReviewRecord["reviewType"],
  createdAt: string,
): ReviewRecord {
  const decisions: Record<string, ReviewRecord["decision"]> = {
    APPROVE: "APPROVED",
    EXCUSE: "EXCUSED",
    REVISION_REQUIRED: "REVISION_REQUIRED",
    WAIVE: "WAIVED",
  };
  const decision = decisions[input.decision];
  if (decision === undefined) {
    throw new DomainError("INVALID_INPUT", "审核决定无效");
  }
  return {
    id,
    assignmentId,
    createdAt,
    decision,
    ...(input.note === undefined ? {} : { note: input.note.trim() }),
    requestId: input.requestId,
    reviewerAccountId,
    reviewType,
  };
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
