import type {
  AccountShellView,
  ChildOptionView,
  GroupRoleView,
  GroupWorkspaceView,
  InstitutionDashboardView,
  ParentDashboardView,
  ParentTaskCenterView,
  PlatformDashboardView,
  PresentationTaskItemView,
  ProviderDashboardView,
  ReviewQueueInput,
  ReviewQueueView,
  TeacherDashboardView,
  TreeSummaryView,
} from "./presentation-models.js";
import type { ApplicationDependencies } from "./ports.js";
import { ViewModelService } from "./view-models.js";
import type { ActorContext, Child, ChildGroupMembership } from "../domain/model.js";
import { AccessPolicy } from "../domain/policy.js";
import { DomainError } from "../shared/errors.js";

export class PresentationService {
  private readonly policy: AccessPolicy;
  private readonly views: ViewModelService;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
    this.views = new ViewModelService(dependencies);
  }

  async accountShell(actor: ActorContext): Promise<AccountShellView> {
    const familyMemberships = await this.dependencies.repository.query("familyMembers", {
      accountId: actor.accountId,
      status: "ACTIVE",
    });
    const families = await Promise.all(
      familyMemberships.map(async (membership) => {
        const family = await this.requireRecord("families", membership.familyId, "家庭不存在");
        const guardianLinks = await this.dependencies.repository.query("guardianLinks", {
          accountId: actor.accountId,
          familyId: family.id,
          status: "ACTIVE",
        });
        const children = await Promise.all(
          guardianLinks.map(async (link) => {
            const child = await this.requireRecord("children", link.childId, "孩子不存在");
            return childOption(child, false);
          }),
        );
        return { children, id: family.id, name: family.name, role: membership.role };
      }),
    );

    const organizationMemberships = await this.dependencies.repository.query(
      "organizationMembers",
      (member) =>
        member.accountId === actor.accountId &&
        member.memberType === "ADULT" &&
        member.organizationRole !== undefined &&
        member.status === "ACTIVE",
    );
    const organizations = await Promise.all(
      organizationMemberships.map(async (membership) => {
        const organization = await this.dependencies.repository.read(
          "organizations",
          membership.organizationId,
        );
        if (organization?.status !== "ACTIVE") return undefined;
        return {
          id: organization.id,
          name: organization.name,
          role: membership.organizationRole as "ORGANIZATION_ADMIN" | "STAFF",
          type: organization.type,
        };
      }),
    );

    return {
      families: families.sort(byName),
      groups: (await this.groupRoles(actor)).sort(byName),
      organizations:
        actor.mode === "ACCOUNT"
          ? organizations.filter((organization) => organization !== undefined).sort(byName)
          : [],
    };
  }

  async familySettings(actor: ActorContext, familyId: string) {
    if (actor.mode !== "ACCOUNT") throw new DomainError("FORBIDDEN", "家庭设置仅限成人账号");
    const membership = await this.policy.requireFamilyRole(actor, familyId);
    const family = await this.requireRecord("families", familyId, "家庭不存在");
    const members = await this.dependencies.repository.query("familyMembers", {
      familyId,
      status: "ACTIVE",
    });
    const links = await this.dependencies.repository.query("guardianLinks", {
      familyId,
      status: "ACTIVE",
    });
    return {
      id: family.id,
      name: family.name,
      role: membership.role,
      defaultRewards: family.defaultRewards,
      autoRewardInstitutionTasks: family.autoRewardInstitutionTasks,
      endOfDayHour: family.endOfDayHour,
      childCount: new Set(links.map((link) => link.childId)).size,
      members: members.map((member) => ({
        id: member.id,
        role: member.role,
        isSelf: member.accountId === actor.accountId,
      })),
    };
  }

  async childGroups(actor: ActorContext, childId: string) {
    if (actor.mode !== "ACCOUNT" && !(actor.mode === "CHILD" && actor.childId === childId))
      throw new DomainError("FORBIDDEN", "不能读取其他孩子的分组");
    await this.policy.requireGuardian(actor, childId);
    const memberships = await this.dependencies.repository.query("childGroupMemberships", {
      childId,
      status: "ACTIVE",
    });
    const pending = await this.dependencies.repository.query("joinRequests", {
      childId,
      status: "PENDING_APPROVAL",
    });
    const details = async (groupId: string, organizationId: string) => {
      const group = await this.requireRecord("groups", groupId, "分组不存在");
      const organization = await this.requireRecord("organizations", organizationId, "机构不存在");
      return {
        groupId,
        name: group.name,
        organizationName: organization.name,
        type: organization.type,
      };
    };
    return {
      memberships: await Promise.all(
        memberships.map(async (member) => ({
          ...(await details(member.groupId, member.organizationId)),
          id: member.id,
          status: member.status,
          disclosure: member.disclosure,
        })),
      ),
      pending: await Promise.all(
        pending.map(async (request) => ({
          ...(await details(request.groupId, request.organizationId)),
          id: request.id,
          status: request.status,
        })),
      ),
    };
  }

  async parentDashboard(
    actor: ActorContext,
    input: { readonly childId: string; readonly date: string },
  ): Promise<ParentDashboardView> {
    const guardian = await this.policy.requireGuardian(actor, input.childId);
    const child = await this.requireRecord("children", input.childId, "孩子不存在");
    const family = await this.requireRecord("families", guardian.familyId, "家庭不存在");
    const links = await this.dependencies.repository.query("guardianLinks", {
      accountId: actor.accountId,
      familyId: guardian.familyId,
      status: "ACTIVE",
    });
    const children = await Promise.all(
      links.map(async (link) => {
        const linkedChild = await this.requireRecord("children", link.childId, "孩子不存在");
        return childOption(linkedChild, linkedChild.id === child.id);
      }),
    );
    const childActor: ActorContext = {
      accountId: actor.accountId,
      childId: child.id,
      mode: "CHILD",
    };
    const today = await this.views.childToday(childActor, input.date);
    const items = await Promise.all(
      [...today.mustDo, ...today.familyFocus, ...today.challenges].map((item) =>
        this.presentationTask(item.assignmentId),
      ),
    );
    const currentTreeRecord = (
      await this.dependencies.repository.query("childTrees", {
        childId: child.id,
        status: "GROWING",
      })
    )[0];
    const currentTree =
      currentTreeRecord === undefined ? undefined : await this.treeSummary(currentTreeRecord);
    const memberships = await this.dependencies.repository.query("childGroupMemberships", {
      childId: child.id,
      status: "ACTIVE",
    });
    const groups = await Promise.all(
      memberships.map(async (membership) => {
        const group = await this.requireRecord("groups", membership.groupId, "分组不存在");
        return { id: group.id, name: group.name };
      }),
    );

    return {
      children: children.sort(byNickname),
      ...(currentTree === undefined ? {} : { currentTree }),
      family: { id: family.id, name: family.name },
      groups: groups.sort(byName),
      selectedChild: childOption(child, false),
      today: {
        allDone: today.allDone,
        completedCount: items.filter((item) =>
          ["SUBMITTED", "COMPLETED", "EXCUSED"].includes(item.taskState),
        ).length,
        date: input.date,
        items,
        pendingReviewCount: items.filter(
          (item) =>
            item.taskState === "SUBMITTED" &&
            ["PROTECTED", "PENDING_CONFIRMATION"].includes(item.rewardState),
        ).length,
        requiredCount: today.completionRequiredAssignmentIds.length,
      },
    };
  }

  async parentTaskCenter(
    actor: ActorContext,
    input: { readonly childId: string },
  ): Promise<ParentTaskCenterView> {
    await this.policy.requireGuardian(actor, input.childId);
    const child = await this.requireRecord("children", input.childId, "孩子不存在");
    const assignments = await this.dependencies.repository.query("taskAssignments", {
      childId: input.childId,
    });
    const items = await Promise.all(
      assignments.map((assignment) => this.presentationTask(assignment.id)),
    );
    return {
      child: childOption(child, false),
      items: items.sort((left, right) => left.dueAt.localeCompare(right.dueAt)),
    };
  }

  async reviewQueue(actor: ActorContext, input: ReviewQueueInput): Promise<ReviewQueueView> {
    if (input.kind === "FAMILY") {
      await this.policy.requireGuardian(actor, input.childId);
      const child = await this.requireRecord("children", input.childId, "孩子不存在");
      const assignments = await this.dependencies.repository.query(
        "taskAssignments",
        (assignment) =>
          assignment.childId === input.childId &&
          assignment.taskState === "SUBMITTED" &&
          ["PROTECTED", "PENDING_CONFIRMATION"].includes(assignment.rewardState),
      );
      const familyAssignments = [];
      for (const assignment of assignments) {
        const task = await this.requireRecord("tasks", assignment.taskId, "任务不存在");
        if (task.source === "FAMILY") {
          familyAssignments.push({ assignment, task });
        }
      }
      const items = await Promise.all(
        familyAssignments.map(async ({ assignment, task }) => {
          const submittedAt = await this.latestSubmissionAt(assignment.id);
          return {
            academicState: assignment.academicState,
            assignmentId: assignment.id,
            childId: child.id,
            childLabel: child.nickname,
            rewardState: assignment.rewardState,
            source: task.source,
            ...(submittedAt === undefined ? {} : { submittedAt }),
            title: task.title,
          };
        }),
      );
      return { childId: input.childId, items, kind: "FAMILY" };
    }

    const access = await this.requireGroupAccess(actor, input.groupId);
    const activeMemberships = await this.dependencies.repository.query("childGroupMemberships", {
      groupId: input.groupId,
      organizationId: access.organizationId,
      status: "ACTIVE",
    });
    const activeMemberIds = new Set(activeMemberships.map((member) => member.organizationMemberId));
    const assignments = await this.dependencies.repository.query(
      "taskAssignments",
      (assignment) =>
        assignment.groupId === input.groupId &&
        assignment.taskState === "SUBMITTED" &&
        assignment.academicState === "PENDING" &&
        assignment.organizationMemberId !== undefined &&
        activeMemberIds.has(assignment.organizationMemberId),
    );
    const items = await Promise.all(
      assignments.map(async (assignment) => {
        const task = await this.requireRecord("tasks", assignment.taskId, "任务不存在");
        const organizationMemberId = assignment.organizationMemberId;
        if (organizationMemberId === undefined) {
          throw new DomainError("NOT_FOUND", "机构成员不存在");
        }
        const member = (
          await this.dependencies.repository.query("organizationMembers", {
            organizationId: access.organizationId,
            organizationMemberId,
            childId: assignment.childId,
            memberType: "CHILD",
            status: "ACTIVE",
          })
        )[0];
        if (member === undefined) {
          throw new DomainError("NOT_FOUND", "机构成员不存在");
        }
        const submittedAt = await this.latestSubmissionAt(assignment.id);
        return {
          academicState: assignment.academicState,
          assignmentId: assignment.id,
          childLabel: (
            await this.disclosedChild(
              activeMemberships.find(
                (membership) =>
                  membership.organizationMemberId === organizationMemberId &&
                  membership.childId === assignment.childId,
              ),
            )
          ).displayName,
          organizationMemberId,
          ...(submittedAt === undefined ? {} : { submittedAt }),
          title: task.title,
        };
      }),
    );
    return { groupId: input.groupId, items, kind: "GROUP" };
  }

  async teacherDashboard(
    actor: ActorContext,
    input: { readonly date: string },
  ): Promise<TeacherDashboardView> {
    const groups = await this.groupRoles(actor);
    const groupIds = new Set(groups.map((group) => group.id));
    const assignments = await this.dependencies.repository.query(
      "taskAssignments",
      (assignment) => assignment.groupId !== undefined && groupIds.has(assignment.groupId),
    );
    return {
      date: input.date,
      groups: groups.sort(byName),
      metrics: {
        dueToday: assignments.filter((assignment) => assignment.occurrenceDate === input.date)
          .length,
        pendingReview: assignments.filter(
          (assignment) =>
            assignment.taskState === "SUBMITTED" && assignment.academicState === "PENDING",
        ).length,
        revisionRequired: assignments.filter(
          (assignment) => assignment.academicState === "REVISION_REQUIRED",
        ).length,
      },
    };
  }

  async groupSubmissions(actor: ActorContext, input: { groupId: string; taskId?: string }) {
    const access = await this.requireGroupAccess(actor, input.groupId);
    const memberships = await this.dependencies.repository.query("childGroupMemberships", {
      groupId: input.groupId,
      organizationId: access.organizationId,
      status: "ACTIVE",
    });
    const activeIds = new Set(memberships.map((member) => member.organizationMemberId));
    const assignments = await this.dependencies.repository.query(
      "taskAssignments",
      (assignment) =>
        assignment.groupId === input.groupId &&
        (input.taskId === undefined || assignment.taskId === input.taskId) &&
        assignment.organizationMemberId !== undefined &&
        activeIds.has(assignment.organizationMemberId),
    );
    return Promise.all(
      assignments.map(async (assignment) => {
        const task = await this.requireRecord("tasks", assignment.taskId, "任务不存在");
        const organizationMemberId = assignment.organizationMemberId;
        if (!organizationMemberId) throw new DomainError("NOT_FOUND", "机构成员不存在");
        const member = (
          await this.dependencies.repository.query("organizationMembers", {
            organizationId: access.organizationId,
            organizationMemberId,
            childId: assignment.childId,
            memberType: "CHILD",
            status: "ACTIVE",
          })
        )[0];
        if (!member) throw new DomainError("NOT_FOUND", "成员已退出或不可读取");
        return {
          id: assignment.id,
          taskId: task.id,
          title: task.title,
          name: (
            await this.disclosedChild(
              memberships.find(
                (membership) =>
                  membership.organizationMemberId === organizationMemberId &&
                  membership.childId === assignment.childId,
              ),
            )
          ).displayName,
          taskState: assignment.taskState,
          academicState: assignment.academicState,
          submittedAt: (await this.latestSubmissionAt(assignment.id)) || "",
        };
      }),
    );
  }

  async groupTaskTemplates(actor: ActorContext, groupId: string) {
    const access = await this.requireGroupAccess(actor, groupId);
    const templates = await this.dependencies.repository.query(
      "taskTemplates",
      (template) =>
        template.status === "ACTIVE" &&
        template.ownerScope.kind === "ORGANIZATION" &&
        template.ownerScope.organizationId === access.organizationId,
    );
    return templates.map((template) => ({
      id: template.id,
      title: template.title,
      description: template.description || "",
      category: template.category,
      importance: template.importance,
      estimatedMinutes: template.estimatedMinutes,
      submissionMode: template.submissionMode,
      allowLateSubmission: template.allowLateSubmission,
      requiresAcademicReview: template.requiresAcademicReview,
    }));
  }

  async groupJoinRequests(actor: ActorContext, groupId: string) {
    await this.requireGroupAccess(actor, groupId);
    const requests = await this.dependencies.repository.query("joinRequests", {
      groupId,
      status: "PENDING_APPROVAL",
    });
    return Promise.all(
      requests.map(async (request) => {
        const child = await this.requireRecord("children", request.childId, "孩子不存在");
        return {
          id: request.id,
          name: request.disclosure.displayName ? child.nickname : "未披露昵称",
          ...(request.disclosure.grade && child.grade !== undefined ? { grade: child.grade } : {}),
          status: request.status,
          createdAt: request.createdAt,
        };
      }),
    );
  }

  async groupWorkspace(
    actor: ActorContext,
    input: { readonly groupId: string },
  ): Promise<GroupWorkspaceView> {
    const role = await this.requireGroupAccess(actor, input.groupId);
    const group = await this.requireRecord("groups", input.groupId, "分组不存在");
    const organization = await this.requireRecord(
      "organizations",
      role.organizationId,
      "机构不存在",
    );
    const memberships = await this.dependencies.repository.query("childGroupMemberships", {
      groupId: input.groupId,
      organizationId: role.organizationId,
      status: "ACTIVE",
    });
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const member = (
          await this.dependencies.repository.query("organizationMembers", {
            organizationId: role.organizationId,
            organizationMemberId: membership.organizationMemberId,
            childId: membership.childId,
            memberType: "CHILD",
            status: "ACTIVE",
          })
        )[0];
        if (member === undefined) {
          throw new DomainError("NOT_FOUND", "机构成员不存在");
        }
        return {
          ...(await this.disclosedChild(membership)),
          organizationMemberId: member.organizationMemberId,
        };
      }),
    );
    const tasks = await this.dependencies.repository.query(
      "tasks",
      (task) => task.groupId === input.groupId,
    );
    const taskViews = await Promise.all(
      tasks.map(async (task) => {
        const assignments = await this.dependencies.repository.query("taskAssignments", {
          taskId: task.id,
        });
        return {
          assignmentCount: assignments.length,
          completedCount: assignments.filter((assignment) => assignment.taskState === "COMPLETED")
            .length,
          dueAt: task.dueAt,
          id: task.id,
          status: task.status,
          title: task.title,
        };
      }),
    );
    const groupTree = (
      await this.dependencies.repository.query(
        "groupTrees",
        (tree) =>
          tree.groupId === input.groupId && (tree.status === "GROWING" || tree.status === "MATURE"),
      )
    )[0];

    return {
      group: {
        id: group.id,
        name: group.name,
        organizationId: organization.id,
        organizationName: organization.name,
      },
      ...(groupTree === undefined
        ? {}
        : {
            groupTree: {
              id: groupTree.id,
              progress: groupTree.progress,
              stage: groupTree.stage,
              status: groupTree.status,
              threshold: groupTree.threshold,
            },
          }),
      members: members.sort(byDisplayName),
      tasks: taskViews.sort((left, right) => left.dueAt.localeCompare(right.dueAt)),
    };
  }

  async institutionDashboard(
    actor: ActorContext,
    input: { readonly organizationId: string },
  ): Promise<InstitutionDashboardView> {
    await this.policy.requireOrganizationRole(actor, input.organizationId);
    const organization = await this.requireRecord(
      "organizations",
      input.organizationId,
      "机构不存在",
    );
    const groups = await this.dependencies.repository.query("groups", {
      organizationId: input.organizationId,
      status: "ACTIVE",
    });
    const groupViews = await Promise.all(
      groups.map(async (group) => ({
        id: group.id,
        memberCount: (
          await this.dependencies.repository.query("childGroupMemberships", {
            groupId: group.id,
            status: "ACTIVE",
          })
        ).length,
        name: group.name,
        teacherCount: (
          await this.dependencies.repository.query("groupRoleBindings", {
            groupId: group.id,
            status: "ACTIVE",
          })
        ).length,
      })),
    );
    const organizationAssignments = await this.dependencies.repository.query("taskAssignments", {
      organizationId: input.organizationId,
    });
    const publishedTasks = await this.dependencies.repository.query(
      "tasks",
      (task) =>
        task.sourceScope.kind === "ORGANIZATION" &&
        task.sourceScope.organizationId === input.organizationId &&
        task.status === "PUBLISHED",
    );
    return {
      groups: groupViews.sort(byName),
      metrics: {
        activeMembers: (
          await this.dependencies.repository.query("organizationMembers", {
            organizationId: input.organizationId,
            status: "ACTIVE",
          })
        ).length,
        groups: groups.length,
        pendingReviews: organizationAssignments.filter(
          (assignment) => assignment.academicState === "PENDING",
        ).length,
        publishedTasks: publishedTasks.length,
      },
      organization: { id: organization.id, name: organization.name, type: organization.type },
    };
  }

  async platformDashboard(actor: ActorContext): Promise<PlatformDashboardView> {
    if (actor.mode !== "PLATFORM") {
      throw new DomainError("FORBIDDEN", "需要平台运营权限");
    }
    return {
      metrics: {
        activeFamilies: (await this.dependencies.repository.query("families", { status: "ACTIVE" }))
          .length,
        activeOrganizations: (
          await this.dependencies.repository.query("organizations", { status: "ACTIVE" })
        ).length,
        activeSupportGrants: (
          await this.dependencies.repository.query("supportAccessGrants", { status: "ACTIVE" })
        ).length,
        contentProviders: (
          await this.dependencies.repository.query("contentProviders", { status: "ACTIVE" })
        ).length,
        pendingExports: (
          await this.dependencies.repository.query("exportRequests", { status: "PENDING" })
        ).length,
      },
    };
  }

  async providerDashboard(actor: ActorContext): Promise<ProviderDashboardView> {
    if (actor.mode !== "CONTENT_PROVIDER" || actor.contentProviderId === undefined) {
      throw new DomainError("FORBIDDEN", "需要内容服务方身份");
    }
    const provider = await this.requireRecord(
      "contentProviders",
      actor.contentProviderId,
      "内容服务方不存在",
    );
    if (provider.status !== "ACTIVE" || provider.accountId !== actor.accountId) {
      throw new DomainError("FORBIDDEN", "当前账号没有该内容服务方权限");
    }
    const templates = await this.dependencies.repository.query(
      "taskTemplates",
      (template) =>
        template.ownerScope.kind === "CONTENT_PROVIDER" &&
        template.ownerScope.contentProviderId === provider.id,
    );
    return {
      provider: {
        id: provider.id,
        name: provider.name,
        ...(provider.settlementAccountRef === undefined
          ? {}
          : { settlementAccountRef: provider.settlementAccountRef }),
      },
      templates: templates.map((template) => ({
        category: template.category,
        id: template.id,
        status: template.status,
        title: template.title,
      })),
    };
  }

  private async groupRoles(actor: ActorContext): Promise<GroupRoleView[]> {
    if (actor.mode !== "ACCOUNT") return [];
    const bindings = await this.dependencies.repository.query("groupRoleBindings", {
      accountId: actor.accountId,
      status: "ACTIVE",
    });
    const candidates = await Promise.all(
      bindings.map(async (binding) => {
        try {
          const current = await this.policy.requireGroupRole(actor, binding.groupId, [
            binding.role,
          ]);
          if (current.organizationId !== binding.organizationId) return undefined;
        } catch (error) {
          if (
            error instanceof DomainError &&
            (error.code === "FORBIDDEN" || error.code === "NOT_FOUND")
          )
            return undefined;
          throw error;
        }
        const group = await this.requireRecord("groups", binding.groupId, "分组不存在");
        const organization = await this.requireRecord(
          "organizations",
          binding.organizationId,
          "机构不存在",
        );
        return {
          id: group.id,
          name: group.name,
          organizationId: organization.id,
          organizationName: organization.name,
          role: binding.role,
        };
      }),
    );
    const roles: GroupRoleView[] = candidates.filter((role) => role !== undefined);
    const admins = await this.dependencies.repository.query("organizationMembers", {
      accountId: actor.accountId,
      memberType: "ADULT",
      organizationRole: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
    });
    for (const admin of admins) {
      const organization = await this.dependencies.repository.read(
        "organizations",
        admin.organizationId,
      );
      if (organization?.status !== "ACTIVE") continue;
      const groups = await this.dependencies.repository.query("groups", {
        organizationId: organization.id,
        status: "ACTIVE",
      });
      for (const group of groups)
        if (!roles.some((role) => role.id === group.id))
          roles.push({
            id: group.id,
            name: group.name,
            organizationId: organization.id,
            organizationName: organization.name,
            role: "ORGANIZATION_ADMIN",
          });
    }
    return roles;
  }

  private async disclosedChild(
    membership: ChildGroupMembership | undefined,
  ): Promise<{ displayName: string; grade?: number }> {
    if (membership?.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "孩子分组授权已失效");
    const child = await this.requireRecord("children", membership.childId, "孩子不存在");
    return {
      displayName: membership.disclosure.displayName ? child.nickname : "未披露昵称",
      ...(membership.disclosure.grade && child.grade !== undefined ? { grade: child.grade } : {}),
    };
  }

  private async requireGroupAccess(
    actor: ActorContext,
    groupId: string,
  ): Promise<{ organizationId: string }> {
    return this.policy.requireGroupAccess(actor, groupId);
  }

  private async presentationTask(assignmentId: string): Promise<PresentationTaskItemView> {
    const assignment = await this.requireRecord("taskAssignments", assignmentId, "任务实例不存在");
    const task = await this.requireRecord("tasks", assignment.taskId, "任务不存在");
    const group =
      assignment.groupId === undefined
        ? undefined
        : await this.dependencies.repository.read("groups", assignment.groupId);
    return {
      academicState: assignment.academicState,
      assignmentId: assignment.id,
      category: task.category,
      sourceAssetIds: task.sourceAssetIds ?? [],
      ...(task.description === undefined ? {} : { description: task.description }),
      dueAt: task.dueAt,
      ...(assignment.familyFocusRank === undefined
        ? {}
        : { familyFocusRank: assignment.familyFocusRank }),
      ...(group === undefined ? {} : { groupName: group.name }),
      importance: task.importance,
      rewardState: assignment.rewardState,
      source: task.source,
      startsAt: task.startsAt,
      submissionMode: task.submissionMode,
      taskState: assignment.taskState,
      title: task.title,
    };
  }

  private async latestSubmissionAt(assignmentId: string): Promise<string | undefined> {
    const submissions = await this.dependencies.repository.query("submissions", { assignmentId });
    return submissions.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0]
      ?.submittedAt;
  }

  private async treeSummary(tree: {
    readonly id: string;
    readonly catalogId: string;
    readonly name?: string;
    readonly progress: number;
    readonly stage: string;
    readonly status: "GROWING" | "MATURE" | "HARVESTED";
  }): Promise<TreeSummaryView> {
    const catalog = await this.requireRecord("treeCatalog", tree.catalogId, "果树目录不存在");
    return {
      fruitName: catalog.fruitName,
      id: tree.id,
      name: tree.name ?? catalog.name,
      progress: tree.progress,
      stage: tree.stage,
      status: tree.status,
      threshold: catalog.threshold,
    };
  }

  private async requireRecord<K extends keyof import("../domain/model.js").DomainSchema>(
    collection: K,
    id: string,
    message: string,
  ): Promise<import("../domain/model.js").DomainSchema[K]> {
    const record = await this.dependencies.repository.read(collection, id);
    if (record === undefined) {
      throw new DomainError("NOT_FOUND", message);
    }
    return record;
  }
}

function childOption(child: Child, selected: boolean): ChildOptionView {
  return {
    id: child.id,
    nickname: child.nickname,
    selected,
    ...(child.grade === undefined ? {} : { grade: child.grade }),
  };
}

function byName<T extends { readonly name: string }>(left: T, right: T): number {
  return left.name.localeCompare(right.name, "zh-CN");
}

function byNickname<T extends { readonly nickname: string }>(left: T, right: T): number {
  return left.nickname.localeCompare(right.nickname, "zh-CN");
}

function byDisplayName<T extends { readonly displayName: string }>(left: T, right: T): number {
  return left.displayName.localeCompare(right.displayName, "zh-CN");
}
