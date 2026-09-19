import type {
  AcademicReviewState,
  OrganizationType,
  RewardState,
  SubmissionMode,
  TaskCategory,
  TaskImportance,
  TaskInstanceState,
  TaskSource,
  TreeStatus,
} from "../domain/model.js";

export interface ChildOptionView {
  readonly id: string;
  readonly nickname: string;
  readonly grade?: number;
  readonly selected: boolean;
}

export interface FamilyWorkspaceView {
  readonly id: string;
  readonly name: string;
  readonly role: "FAMILY_ADMIN" | "GUARDIAN";
  readonly children: readonly Omit<ChildOptionView, "selected">[];
}

export interface OrganizationWorkspaceView {
  readonly id: string;
  readonly name: string;
  readonly type: OrganizationType;
  readonly role: "ORGANIZATION_ADMIN" | "STAFF";
}

export interface GroupRoleView {
  readonly id: string;
  readonly name: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: "TEACHER" | "ASSISTANT" | "ORGANIZATION_ADMIN";
}

export interface AccountShellView {
  readonly families: readonly FamilyWorkspaceView[];
  readonly organizations: readonly OrganizationWorkspaceView[];
  readonly groups: readonly GroupRoleView[];
}

export interface PresentationTaskItemView {
  readonly assignmentId: string;
  readonly sourceAssetIds?: readonly string[];
  readonly title: string;
  readonly description?: string;
  readonly source: TaskSource;
  readonly category: TaskCategory;
  readonly importance: TaskImportance;
  readonly submissionMode: SubmissionMode;
  readonly startsAt: string;
  readonly dueAt: string;
  readonly taskState: TaskInstanceState;
  readonly academicState: AcademicReviewState;
  readonly rewardState: RewardState;
  readonly familyFocusRank?: number;
  readonly groupName?: string;
}

export interface TodaySummaryView {
  readonly date: string;
  readonly items: readonly PresentationTaskItemView[];
  readonly requiredCount: number;
  readonly completedCount: number;
  readonly pendingReviewCount: number;
  readonly allDone: boolean;
}

export interface TreeSummaryView {
  readonly id: string;
  readonly name: string;
  readonly fruitName: string;
  readonly stage: string;
  readonly progress: number;
  readonly threshold: number;
  readonly status: TreeStatus;
}

export interface ParentDashboardView {
  readonly selectedChild: Omit<ChildOptionView, "selected">;
  readonly children: readonly ChildOptionView[];
  readonly family: { readonly id: string; readonly name: string };
  readonly today: TodaySummaryView;
  readonly currentTree?: TreeSummaryView;
  readonly groups: readonly { readonly id: string; readonly name: string }[];
}

export interface ParentTaskCenterView {
  readonly child: Omit<ChildOptionView, "selected">;
  readonly items: readonly PresentationTaskItemView[];
}

export interface FamilyReviewQueueItemView {
  readonly assignmentId: string;
  readonly childId: string;
  readonly childLabel: string;
  readonly title: string;
  readonly source: TaskSource;
  readonly submittedAt?: string;
  readonly academicState: AcademicReviewState;
  readonly rewardState: RewardState;
}

export interface GroupReviewQueueItemView {
  readonly assignmentId: string;
  readonly organizationMemberId: string;
  readonly childLabel: string;
  readonly title: string;
  readonly submittedAt?: string;
  readonly academicState: AcademicReviewState;
}

export type ReviewQueueView =
  | {
      readonly kind: "FAMILY";
      readonly childId: string;
      readonly items: readonly FamilyReviewQueueItemView[];
    }
  | {
      readonly kind: "GROUP";
      readonly groupId: string;
      readonly items: readonly GroupReviewQueueItemView[];
    };

export interface TeacherDashboardView {
  readonly date: string;
  readonly groups: readonly GroupRoleView[];
  readonly metrics: {
    readonly pendingReview: number;
    readonly revisionRequired: number;
    readonly dueToday: number;
  };
}

export interface GroupWorkspaceView {
  readonly group: {
    readonly id: string;
    readonly name: string;
    readonly organizationId: string;
    readonly organizationName: string;
  };
  readonly members: readonly {
    readonly organizationMemberId: string;
    readonly displayName: string;
    readonly grade?: number;
  }[];
  readonly tasks: readonly {
    readonly id: string;
    readonly title: string;
    readonly dueAt: string;
    readonly status: "PUBLISHED" | "CANCELLED" | "ARCHIVED";
    readonly assignmentCount: number;
    readonly completedCount: number;
  }[];
  readonly groupTree?: Omit<TreeSummaryView, "fruitName" | "name">;
}

export interface InstitutionDashboardView {
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly type: OrganizationType;
  };
  readonly metrics: {
    readonly groups: number;
    readonly activeMembers: number;
    readonly publishedTasks: number;
    readonly pendingReviews: number;
  };
  readonly groups: readonly {
    readonly id: string;
    readonly name: string;
    readonly memberCount: number;
    readonly teacherCount: number;
  }[];
}

export interface PlatformDashboardView {
  readonly metrics: {
    readonly activeFamilies: number;
    readonly activeOrganizations: number;
    readonly contentProviders: number;
    readonly activeSupportGrants: number;
    readonly pendingExports: number;
  };
}

export interface ProviderDashboardView {
  readonly provider: {
    readonly id: string;
    readonly name: string;
    readonly settlementAccountRef?: string;
  };
  readonly templates: readonly {
    readonly id: string;
    readonly title: string;
    readonly category: TaskCategory;
    readonly status: "ACTIVE" | "ARCHIVED";
  }[];
}

export type ReviewQueueInput =
  | { readonly kind: "FAMILY"; readonly childId: string }
  | { readonly kind: "GROUP"; readonly groupId: string };
