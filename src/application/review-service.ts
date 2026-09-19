import type { ApplicationDependencies, ReadRepository, Transaction } from "./ports.js";
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

interface RequestBase {
  readonly requestId: string;
}

export interface ReviewResult {
  readonly assignment: TaskAssignment;
  readonly review: ReviewRecord;
  readonly ledger?: SunlightLedger;
}

export class ReviewService {
  constructor(
    private readonly dependencies: ApplicationDependencies,
    private readonly sunlight: SunlightService,
  ) {}

  async familyReview(
    actor: ActorContext,
    input: RequestBase & {
      readonly assignmentId: string;
      readonly decision: "APPROVE" | "REVISION_REQUIRED" | "EXCUSE" | "WAIVE";
      readonly note?: string;
    },
  ): Promise<ReviewResult> {
    requireRequestId(input.requestId);
    return this.dependencies.repository.transaction(async (tx) => {
      const { assignment, task, family } = await this.loadContext(input.assignmentId, tx);
      if (actor.mode !== "ACCOUNT") throw new DomainError("FORBIDDEN", "请使用成人监护身份");
      const guardian = await new AccessPolicy(tx).requireGuardian(actor, assignment.childId);
      if (guardian.familyId !== assignment.familyId) {
        throw new DomainError("FORBIDDEN", "监护关系不属于任务家庭");
      }
      if (task.source !== "FAMILY") {
        throw new DomainError("FORBIDDEN", "分组任务只能由老师进行学习审核");
      }
      const repeated = await this.findRepeatedReview(actor, input, "FAMILY", tx);
      if (repeated !== undefined) {
        return repeated;
      }
      if (assignment.taskState !== "SUBMITTED") {
        throw new DomainError("CONFLICT", "只有已提交任务可以审核");
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
    return this.dependencies.repository.transaction(async (tx) => {
      const { assignment, task, family } = await this.loadContext(input.assignmentId, tx);
      if (
        task.source !== "LEARNING_GROUP" ||
        task.groupId === undefined ||
        assignment.organizationId === undefined
      ) {
        throw new DomainError("FORBIDDEN", "只有学习小组任务可以进行老师学习审核");
      }
      await this.requireInstitutionReviewer(tx, actor, assignment, task);
      const repeated = await this.findRepeatedReview(actor, input, "ACADEMIC", tx);
      if (repeated !== undefined) return repeated;
      const now = this.dependencies.clock.now();
      const review = makeReview(
        this.dependencies.ids.next("review"),
        assignment.id,
        actor.accountId,
        input,
        "ACADEMIC",
        now,
      );

      const current = assignment;
      if (input.decision === "APPROVE") {
        const approved = (
          await tx.query("reviewRecords", {
            assignmentId: current.id,
            decision: "APPROVED",
            reviewType: "ACADEMIC",
          })
        )[0];
        if (approved !== undefined) {
          const ledger = (
            await tx.query("sunlightLedgers", {
              reason: "TASK_COMPLETED",
              referenceId: current.id,
            })
          )[0];
          return ledger === undefined
            ? { assignment: current, review: approved }
            : { assignment: current, ledger, review: approved };
        }
      }
      if (current.taskState !== "SUBMITTED") {
        throw new DomainError("CONFLICT", "只有已提交任务可以进行学习审核");
      }
      let ledger: SunlightLedger | undefined;
      let patch: Parameters<Transaction["update"]>[2];
      if (input.decision === "APPROVE") {
        ledger = await this.sunlight.grantInTransaction(tx, actor.accountId, current.childId, {
          amount: taskRewardAmount(family, task, current),
          assignmentId: current.id,
          reason: "TASK_COMPLETED",
          requestId: input.requestId,
        });
        if (revisionCompleted && current.rewardState === "GRANTED") {
          ledger = await this.sunlight.grantInTransaction(tx, actor.accountId, assignment.childId, {
            amount: family.defaultRewards.revision,
            assignmentId: current.id,
            reason: "REVISION_COMPLETED",
            referenceId: `${assignment.id}:revision:${review.id}`,
            requestId: input.requestId,
          });
        }
        patch = {
          academicState: "APPROVED",
          rewardState: "GRANTED",
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
          rewardState: current.rewardState === "GRANTED" ? "GRANTED" : "WAIVED",
          taskState: "EXCUSED",
          updatedAt: now,
        };
      }
      await tx.insert("reviewRecords", review);
      const updated = await tx.update("taskAssignments", current.id, patch);
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
    repository: ReadRepository = this.dependencies.repository,
  ): Promise<ReviewResult | undefined> {
    const review = (
      await repository.query("reviewRecords", {
        assignmentId: input.assignmentId,
        requestId: input.requestId,
        reviewType,
        reviewerAccountId: actor.accountId,
      })
    )[0];
    if (review === undefined) {
      return undefined;
    }
    const assignment = await repository.read("taskAssignments", input.assignmentId);
    if (assignment === undefined) {
      throw new DomainError("CONFLICT", "审核记录缺少任务实例");
    }
    const ledgers = await repository.query(
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
    repository: ReadRepository = this.dependencies.repository,
  ): Promise<{ assignment: TaskAssignment; task: Task; family: Family }> {
    const assignment = await repository.read("taskAssignments", assignmentId);
    if (assignment === undefined) {
      throw new DomainError("NOT_FOUND", "任务实例不存在");
    }
    const task = await repository.read("tasks", assignment.taskId);
    const family = await repository.read("families", assignment.familyId);
    if (task?.status !== "PUBLISHED" || family?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "任务或家庭不存在");
    }
    return { assignment, family, task };
  }

  private async requireInstitutionReviewer(
    tx: Transaction,
    actor: ActorContext,
    assignment: TaskAssignment,
    task: Task,
  ): Promise<void> {
    if (
      actor.mode !== "ACCOUNT" ||
      task.groupId === undefined ||
      assignment.organizationMemberId === undefined ||
      task.groupId !== assignment.groupId ||
      task.sourceScope.kind !== "ORGANIZATION" ||
      task.sourceScope.organizationId !== assignment.organizationId
    ) {
      throw new DomainError("FORBIDDEN", "任务不属于当前可审核分组");
    }
    const group = await tx.read("groups", task.groupId);
    const organization =
      group === undefined ? undefined : await tx.read("organizations", group.organizationId);
    const memberships = await tx.query("childGroupMemberships", {
      childId: assignment.childId,
      groupId: task.groupId,
      organizationId: assignment.organizationId,
      organizationMemberId: assignment.organizationMemberId,
      status: "ACTIVE",
    });
    const childMember = (
      await tx.query("organizationMembers", {
        organizationMemberId: assignment.organizationMemberId,
        organizationId: assignment.organizationId,
        childId: assignment.childId,
        memberType: "CHILD",
        status: "ACTIVE",
      })
    )[0];
    if (
      group?.status !== "ACTIVE" ||
      organization?.status !== "ACTIVE" ||
      group.organizationId !== assignment.organizationId ||
      memberships.length === 0 ||
      childMember === undefined
    ) {
      throw new DomainError("FORBIDDEN", "孩子已撤回授权或分组已停用");
    }
    const policy = new AccessPolicy(tx);
    await policy.requireOrganizationRole(actor, group.organizationId);
    const binding = await policy.requireGroupRole(actor, group.id);
    if (binding.organizationId !== group.organizationId)
      throw new DomainError("FORBIDDEN", "教师绑定不属于任务机构");
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
