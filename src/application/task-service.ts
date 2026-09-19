import type { ApplicationDependencies, Transaction } from "./ports.js";
import type {
  ActorContext,
  CalendarDate,
  Task,
  TaskAssignment,
  TaskCategory,
  TaskImportance,
  TaskSchedule,
  TaskSource,
  TaskTemplate,
  SubmissionMode,
  TenantScope,
} from "../domain/model.js";
import { AccessPolicy } from "../domain/policy.js";
import { assignmentBusinessKey, assertValidSchedule, isScheduledOn } from "../domain/tasks.js";
import { DomainError } from "../shared/errors.js";
import { MediaService } from "./media-service.js";

interface RequestBase {
  readonly requestId: string;
}

interface TaskFields {
  readonly title: string;
  readonly description?: string;
  readonly category: TaskCategory;
  readonly importance: TaskImportance;
  readonly estimatedMinutes: number;
  readonly submissionMode: SubmissionMode;
  readonly schedule: TaskSchedule;
  readonly startsAt: string;
  readonly dueAt: string;
  readonly reminderAt?: string;
  readonly allowLateSubmission: boolean;
  readonly requiresAcademicReview: boolean;
  readonly occurrenceDate: CalendarDate;
  readonly sourceAssetIds?: readonly string[];
}

export class TaskService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async createTemplate(
    actor: ActorContext,
    input: RequestBase &
      TaskFields & { readonly familyId?: string; readonly organizationId?: string },
  ): Promise<TaskTemplate> {
    requireRequestId(input.requestId);
    validateTaskFields(input);
    const ownerScope = await this.resolveTemplateScope(actor, input);
    const now = this.dependencies.clock.now();
    const template: TaskTemplate = {
      id: this.dependencies.ids.next("task_template"),
      allowLateSubmission: input.allowLateSubmission,
      category: input.category,
      createdAt: now,
      ...(input.description === undefined ? {} : { description: input.description.trim() }),
      estimatedMinutes: input.estimatedMinutes,
      importance: input.importance,
      ownerScope,
      requiresAcademicReview: input.requiresAcademicReview,
      schedule: structuredClone(input.schedule),
      status: "ACTIVE",
      submissionMode: input.submissionMode,
      title: input.title.trim(),
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("taskTemplates", template);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "TASK_TEMPLATE_CREATED",
        ownerScope,
        template.id,
      );
      return template;
    });
  }

  async archiveTemplate(
    actor: ActorContext,
    input: RequestBase & { readonly templateId: string },
  ): Promise<TaskTemplate> {
    requireRequestId(input.requestId);
    const template = await this.dependencies.repository.read("taskTemplates", input.templateId);
    if (template === undefined) {
      throw new DomainError("NOT_FOUND", "任务模板不存在");
    }
    await this.authorizeScope(actor, template.ownerScope);
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const archived = await tx.update("taskTemplates", template.id, {
        status: "ARCHIVED",
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "TASK_TEMPLATE_ARCHIVED",
        template.ownerScope,
        template.id,
      );
      return archived;
    });
  }

  async publishFamilyTask(
    actor: ActorContext,
    input: RequestBase &
      TaskFields & { readonly familyId: string; readonly childIds: readonly string[] },
  ): Promise<Task> {
    requireRequestId(input.requestId);
    validateTaskFields(input);
    await this.policy.requireFamilyRole(actor, input.familyId);
    const childIds = [...new Set(input.childIds)];
    if (childIds.length === 0) {
      throw new DomainError("INVALID_INPUT", "至少选择一个孩子");
    }
    for (const childId of childIds) {
      const guardian = await this.policy.requireGuardian(actor, childId);
      if (guardian.familyId !== input.familyId) {
        throw new DomainError("FORBIDDEN", "孩子不属于当前家庭");
      }
    }
    const scope: TenantScope = { kind: "FAMILY", familyId: input.familyId };
    await MediaService.assertTaskSourceAssets(
      this.dependencies,
      actor,
      scope,
      input.sourceAssetIds ?? [],
    );
    const task = this.makeTask(actor, input, "FAMILY", scope);
    const assignments = childIds.map((childId) =>
      this.makeAssignment(task, input.occurrenceDate, {
        childId,
        familyId: input.familyId,
      }),
    );
    return this.persistPublication(actor, input.requestId, task, assignments);
  }

  async publishGroupTask(
    actor: ActorContext,
    input: RequestBase & TaskFields & { readonly groupId: string },
  ): Promise<Task> {
    requireRequestId(input.requestId);
    validateTaskFields(input);
    const group = await this.dependencies.repository.read("groups", input.groupId);
    if (group?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "分组不存在或已停用");
    }
    await this.authorizeGroup(actor, group.id, group.organizationId);
    const organization = await this.dependencies.repository.read(
      "organizations",
      group.organizationId,
    );
    if (organization?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "机构不存在或已停用");
    }
    const memberships = await this.dependencies.repository.query("childGroupMemberships", {
      groupId: group.id,
      status: "ACTIVE",
    });
    if (memberships.length === 0) {
      throw new DomainError("INVALID_INPUT", "分组中没有有效孩子成员");
    }
    const source: TaskSource =
      organization.type === "TUTORING"
        ? "TUTORING"
        : group.type === "INTEREST" || group.type === "TEMPORARY"
          ? "LEARNING_GROUP"
          : "SCHOOL";
    const scope: TenantScope = {
      kind: "ORGANIZATION",
      organizationId: group.organizationId,
    };
    await MediaService.assertTaskSourceAssets(
      this.dependencies,
      actor,
      scope,
      input.sourceAssetIds ?? [],
    );
    const task = this.makeTask(actor, input, source, scope, group.id);
    const assignments = [];
    for (const membership of memberships) {
      const guardianLink = (
        await this.dependencies.repository.query("guardianLinks", {
          childId: membership.childId,
          status: "ACTIVE",
        })
      )[0];
      if (guardianLink === undefined) {
        throw new DomainError("CONFLICT", "分组成员缺少有效家庭关系");
      }
      assignments.push(
        this.makeAssignment(task, input.occurrenceDate, {
          childId: membership.childId,
          familyId: guardianLink.familyId,
          groupId: membership.groupId,
          organizationId: membership.organizationId,
          organizationMemberId: membership.organizationMemberId,
        }),
      );
    }
    return this.persistPublication(actor, input.requestId, task, assignments);
  }

  async cancelTask(
    actor: ActorContext,
    input: RequestBase & { readonly taskId: string },
  ): Promise<Task> {
    requireRequestId(input.requestId);
    const task = await this.dependencies.repository.read("tasks", input.taskId);
    if (task === undefined) {
      throw new DomainError("NOT_FOUND", "任务不存在");
    }
    await this.authorizeTask(actor, task);
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const cancelled = await tx.update("tasks", task.id, {
        status: "CANCELLED",
        updatedAt: now,
      });
      const assignments = await tx.query("taskAssignments", { taskId: task.id });
      for (const assignment of assignments) {
        if (!["COMPLETED", "EXCUSED", "CANCELLED"].includes(assignment.taskState)) {
          await tx.update("taskAssignments", assignment.id, {
            taskState: "CANCELLED",
            updatedAt: now,
          });
        }
      }
      await this.audit(tx, actor, input.requestId, "TASK_CANCELLED", task.sourceScope, task.id);
      return cancelled;
    });
  }

  async setFamilyFocus(
    actor: ActorContext,
    input: RequestBase & {
      readonly childId: string;
      readonly date: CalendarDate;
      readonly assignmentIds: readonly string[];
    },
  ): Promise<TaskAssignment[]> {
    requireRequestId(input.requestId);
    const guardian = await this.policy.requireGuardian(actor, input.childId);
    const assignmentIds = [...new Set(input.assignmentIds)];
    if (assignmentIds.length < 1 || assignmentIds.length > 3) {
      throw new DomainError("INVALID_INPUT", "家庭重点必须选择 1 至 3 项任务");
    }
    const selected: TaskAssignment[] = [];
    for (const assignmentId of assignmentIds) {
      const assignment = await this.dependencies.repository.read("taskAssignments", assignmentId);
      if (
        assignment === undefined ||
        assignment.childId !== input.childId ||
        assignment.familyId !== guardian.familyId ||
        assignment.occurrenceDate !== input.date
      ) {
        throw new DomainError("FORBIDDEN", "只能设置自己孩子当天的任务为家庭重点");
      }
      selected.push(assignment);
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const current = await tx.query("taskAssignments", {
        childId: input.childId,
        occurrenceDate: input.date,
      });
      for (const assignment of current) {
        if (assignment.familyFocusRank !== undefined) {
          await tx.update("taskAssignments", assignment.id, (record) => {
            const { familyFocusRank: _removed, ...withoutRank } = record;
            return { ...withoutRank, updatedAt: now };
          });
        }
      }
      const focused = [];
      for (const [index, assignment] of selected.entries()) {
        focused.push(
          await tx.update("taskAssignments", assignment.id, {
            familyFocusRank: index + 1,
            updatedAt: now,
          }),
        );
      }
      await this.audit(
        tx,
        actor,
        input.requestId,
        "FAMILY_FOCUS_SET",
        { kind: "FAMILY", familyId: guardian.familyId },
        input.childId,
      );
      return focused;
    });
  }

  private makeTask(
    actor: ActorContext,
    input: TaskFields,
    source: TaskSource,
    sourceScope: TenantScope,
    groupId?: string,
  ): Task {
    const now = this.dependencies.clock.now();
    return {
      id: this.dependencies.ids.next("task"),
      allowLateSubmission: input.allowLateSubmission,
      category: input.category,
      createdAt: now,
      ...(input.description === undefined ? {} : { description: input.description.trim() }),
      dueAt: input.dueAt,
      estimatedMinutes: input.estimatedMinutes,
      ...(groupId === undefined ? {} : { groupId }),
      importance: input.importance,
      publisherAccountId: actor.accountId,
      ...(input.reminderAt === undefined ? {} : { reminderAt: input.reminderAt }),
      requiresAcademicReview: input.requiresAcademicReview,
      schedule: structuredClone(input.schedule),
      source,
      sourceAssetIds: [...(input.sourceAssetIds ?? [])],
      sourceScope,
      startsAt: input.startsAt,
      status: "PUBLISHED",
      submissionMode: input.submissionMode,
      title: input.title.trim(),
      updatedAt: now,
    };
  }

  private makeAssignment(
    task: Task,
    occurrenceDate: CalendarDate,
    recipient: {
      readonly childId: string;
      readonly familyId: string;
      readonly groupId?: string;
      readonly organizationId?: string;
      readonly organizationMemberId?: string;
    },
  ): TaskAssignment {
    const now = this.dependencies.clock.now();
    return {
      id: this.dependencies.ids.next("assignment"),
      academicState: task.requiresAcademicReview ? "PENDING" : "NOT_REQUIRED",
      acceptedLateChallenge: false,
      businessKey: assignmentBusinessKey(task.id, recipient.childId, occurrenceDate),
      childId: recipient.childId,
      createdAt: now,
      familyId: recipient.familyId,
      ...(recipient.groupId === undefined ? {} : { groupId: recipient.groupId }),
      occurrenceDate,
      ...(recipient.organizationId === undefined
        ? {}
        : { organizationId: recipient.organizationId }),
      ...(recipient.organizationMemberId === undefined
        ? {}
        : { organizationMemberId: recipient.organizationMemberId }),
      publicPoolEventCreated: false,
      rewardState: "NOT_ELIGIBLE",
      taskId: task.id,
      taskState: "PENDING",
      updatedAt: now,
    };
  }

  private async persistPublication(
    actor: ActorContext,
    requestId: string,
    task: Task,
    assignments: readonly TaskAssignment[],
  ): Promise<Task> {
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("tasks", task);
      for (const assignment of assignments) {
        const duplicate = await tx.query("taskAssignments", {
          businessKey: assignment.businessKey,
        });
        if (duplicate.length > 0) {
          throw new DomainError("ALREADY_EXISTS", "该任务实例已经生成");
        }
        await tx.insert("taskAssignments", assignment);
      }
      await this.audit(tx, actor, requestId, "TASK_PUBLISHED", task.sourceScope, task.id);
      return task;
    });
  }

  private async resolveTemplateScope(
    actor: ActorContext,
    input: { readonly familyId?: string; readonly organizationId?: string },
  ): Promise<TenantScope> {
    if ((input.familyId === undefined) === (input.organizationId === undefined)) {
      throw new DomainError("INVALID_INPUT", "模板必须且只能属于一个家庭或机构");
    }
    if (input.familyId !== undefined) {
      await this.policy.requireFamilyRole(actor, input.familyId);
      return { kind: "FAMILY", familyId: input.familyId };
    }
    const organizationId = input.organizationId ?? "";
    await this.policy.requireOrganizationRole(actor, organizationId);
    return { kind: "ORGANIZATION", organizationId };
  }

  private async authorizeScope(actor: ActorContext, scope: TenantScope): Promise<void> {
    if (scope.kind === "FAMILY") {
      await this.policy.requireFamilyRole(actor, scope.familyId);
      return;
    }
    if (scope.kind === "ORGANIZATION") {
      await this.policy.requireOrganizationRole(actor, scope.organizationId);
      return;
    }
    throw new DomainError("FORBIDDEN", "当前空间不能管理任务模板");
  }

  private async authorizeTask(actor: ActorContext, task: Task): Promise<void> {
    if (task.groupId !== undefined && task.sourceScope.kind === "ORGANIZATION") {
      await this.authorizeGroup(actor, task.groupId, task.sourceScope.organizationId);
      return;
    }
    await this.authorizeScope(actor, task.sourceScope);
  }

  private async authorizeGroup(
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

function validateTaskFields(input: TaskFields): void {
  const titleLength = input.title.trim().length;
  if (titleLength < 1 || titleLength > 100) {
    throw new DomainError("INVALID_INPUT", "任务标题长度必须是 1 至 100 个字符");
  }
  if (
    !Number.isInteger(input.estimatedMinutes) ||
    input.estimatedMinutes < 1 ||
    input.estimatedMinutes > 480
  ) {
    throw new DomainError("INVALID_INPUT", "预计用时必须是 1 至 480 分钟");
  }
  assertValidSchedule(input.schedule);
  if (!isScheduledOn(input.schedule, input.occurrenceDate)) {
    throw new DomainError("INVALID_INPUT", "任务日期不符合周期规则");
  }
  if (Date.parse(input.startsAt) >= Date.parse(input.dueAt)) {
    throw new DomainError("INVALID_INPUT", "任务截止时间必须晚于开始时间");
  }
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
