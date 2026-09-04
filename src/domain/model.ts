export type IsoInstant = string;
export type CalendarDate = string;

export interface BaseRecord {
  readonly id: string;
  readonly createdAt: IsoInstant;
}

export interface MutableRecord extends BaseRecord {
  updatedAt: IsoInstant;
}

export type ActiveStatus = "ACTIVE" | "INACTIVE";
export type MembershipStatus = "ACTIVE" | "PENDING" | "REJECTED" | "WITHDRAWN";

export type TenantScope =
  | { readonly kind: "FAMILY"; readonly familyId: string }
  | { readonly kind: "ORGANIZATION"; readonly organizationId: string }
  | { readonly kind: "PLATFORM" }
  | { readonly kind: "CONTENT_PROVIDER"; readonly contentProviderId: string };

export interface ActorContext {
  readonly accountId: string;
  readonly mode: "ACCOUNT" | "CHILD" | "PLATFORM" | "CONTENT_PROVIDER";
  readonly childId?: string;
  readonly contentProviderId?: string;
}

export interface Account extends MutableRecord {
  readonly openId: string;
  status: ActiveStatus;
}

export interface RewardDefaults {
  ordinary: number;
  focus: number;
  challenge: number;
  revision: number;
}

export interface Family extends MutableRecord {
  name: string;
  status: ActiveStatus;
  defaultRewards: RewardDefaults;
  autoRewardInstitutionTasks: boolean;
  endOfDayHour: number;
}

export interface FamilyMember extends MutableRecord {
  readonly familyId: string;
  readonly accountId: string;
  role: "FAMILY_ADMIN" | "GUARDIAN";
  status: MembershipStatus;
}

export interface Child extends MutableRecord {
  nickname: string;
  grade?: number;
  avatarAssetId?: string;
  status: ActiveStatus;
}

export interface GuardianLink extends MutableRecord {
  readonly familyId: string;
  readonly childId: string;
  readonly accountId: string;
  role: "PRIMARY" | "GUARDIAN";
  status: MembershipStatus;
}

export type OrganizationType = "SCHOOL" | "TUTORING";

export interface Organization extends MutableRecord {
  name: string;
  type: OrganizationType;
  status: ActiveStatus;
}

export interface OrganizationMember extends MutableRecord {
  readonly organizationId: string;
  readonly accountId?: string;
  readonly childId?: string;
  readonly organizationMemberId: string;
  memberType: "ADULT" | "CHILD";
  organizationRole?: "ORGANIZATION_ADMIN" | "STAFF";
  displayName: string;
  grade?: number;
  internalRosterNumber?: string;
  status: MembershipStatus;
}

export type GroupType = "SCHOOL_CLASS" | "TUTORING_CLASS" | "INTEREST" | "TEMPORARY";

export interface Group extends MutableRecord {
  readonly organizationId: string;
  name: string;
  type: GroupType;
  status: ActiveStatus;
  coGrowingEnabled: boolean;
}

export interface GroupRoleBinding extends MutableRecord {
  readonly organizationId: string;
  readonly groupId: string;
  readonly accountId: string;
  role: "TEACHER" | "ASSISTANT";
  status: MembershipStatus;
}

export interface DisclosureScope {
  displayName: boolean;
  grade: boolean;
  avatar: boolean;
}

export interface ChildGroupMembership extends MutableRecord {
  readonly childId: string;
  readonly organizationId: string;
  readonly organizationMemberId: string;
  readonly groupId: string;
  disclosure: DisclosureScope;
  status: MembershipStatus;
  withdrawnAt?: IsoInstant;
}

export interface Invitation extends BaseRecord {
  readonly organizationId: string;
  readonly groupId: string;
  readonly codeHash: string;
  readonly createdByAccountId: string;
  readonly expiresAt: IsoInstant;
  readonly maxClaims: number;
  readonly purpose: "GROUP_JOIN" | "ROSTER_CLAIM";
  claimCount: number;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "CONSUMED";
}

export interface ConsentRecord extends BaseRecord {
  readonly childId: string;
  readonly guardianAccountId: string;
  readonly organizationId: string;
  readonly groupId: string;
  readonly action: "GRANTED" | "REVOKED";
  readonly disclosure: DisclosureScope;
  readonly requestId: string;
}

export interface JoinRequest extends MutableRecord {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly groupId: string;
  readonly childId: string;
  readonly guardianAccountId: string;
  disclosure: DisclosureScope;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  reviewedByAccountId?: string;
}

export interface RosterSeat extends MutableRecord {
  readonly organizationId: string;
  readonly groupId: string;
  readonly rosterNumber: string;
  readonly claimCodeHash: string;
  status: "UNCLAIMED" | "CLAIMED" | "REVOKED";
  childGroupMembershipId?: string;
}

export type TaskSource = "FAMILY" | "SCHOOL" | "TUTORING" | "LEARNING_GROUP";
export type TaskCategory =
  | "LIFE"
  | "LANGUAGE"
  | "MATHEMATICS"
  | "ENGLISH"
  | "SCIENCE"
  | "ART"
  | "SPORT"
  | "OTHER";
export type TaskImportance = "REQUIRED" | "FOCUS" | "CHALLENGE";
export type SubmissionMode = "CONFIRM" | "TEXT" | "PHOTO" | "TEXT_AND_PHOTO";

export type TaskSchedule =
  | { readonly kind: "ONCE"; readonly date: CalendarDate }
  | { readonly kind: "DAILY"; readonly startDate: CalendarDate; readonly endDate?: CalendarDate }
  | {
      readonly kind: "WEEKLY";
      readonly startDate: CalendarDate;
      readonly endDate?: CalendarDate;
      readonly weekdays: readonly number[];
    };

export interface TaskTemplate extends MutableRecord {
  readonly ownerScope: TenantScope;
  title: string;
  description?: string;
  category: TaskCategory;
  importance: TaskImportance;
  estimatedMinutes: number;
  submissionMode: SubmissionMode;
  schedule: TaskSchedule;
  allowLateSubmission: boolean;
  requiresAcademicReview: boolean;
  status: "ACTIVE" | "ARCHIVED";
}

export interface Task extends MutableRecord {
  readonly templateId?: string;
  readonly source: TaskSource;
  readonly sourceScope: TenantScope;
  readonly groupId?: string;
  readonly publisherAccountId: string;
  readonly title: string;
  readonly description?: string;
  readonly category: TaskCategory;
  readonly importance: TaskImportance;
  readonly estimatedMinutes: number;
  readonly submissionMode: SubmissionMode;
  readonly schedule: TaskSchedule;
  readonly startsAt: IsoInstant;
  readonly dueAt: IsoInstant;
  readonly reminderAt?: IsoInstant;
  readonly allowLateSubmission: boolean;
  readonly requiresAcademicReview: boolean;
  status: "PUBLISHED" | "CANCELLED" | "ARCHIVED";
  readonly draftId?: string;
}

export type TaskInstanceState =
  | "PENDING"
  | "SUBMITTED"
  | "REVISION_REQUIRED"
  | "COMPLETED"
  | "EXCUSED"
  | "CANCELLED"
  | "EXPIRED";

export type AcademicReviewState =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REVISION_REQUIRED"
  | "EXCUSED";

export type RewardState =
  | "NOT_ELIGIBLE"
  | "PROTECTED"
  | "PENDING_CONFIRMATION"
  | "GRANTED"
  | "WAIVED";

export interface TaskAssignment extends MutableRecord {
  readonly taskId: string;
  readonly childId: string;
  readonly familyId: string;
  readonly organizationId?: string;
  readonly organizationMemberId?: string;
  readonly groupId?: string;
  readonly occurrenceDate: CalendarDate;
  readonly businessKey: string;
  taskState: TaskInstanceState;
  academicState: AcademicReviewState;
  rewardState: RewardState;
  acceptedLateChallenge: boolean;
  familyFocusRank?: number;
  publicPoolEventCreated: boolean;
}

export interface Submission extends BaseRecord {
  readonly assignmentId: string;
  readonly childId: string;
  readonly revision: number;
  readonly text?: string;
  readonly mediaAssetIds: readonly string[];
  readonly submittedAt: IsoInstant;
  readonly requestId: string;
}

export interface ReviewRecord extends BaseRecord {
  readonly assignmentId: string;
  readonly reviewType: "FAMILY" | "ACADEMIC";
  readonly decision: "APPROVED" | "REVISION_REQUIRED" | "EXCUSED" | "WAIVED";
  readonly reviewerAccountId: string;
  readonly note?: string;
  readonly requestId: string;
}

export interface SunlightLedger extends BaseRecord {
  readonly childId: string;
  readonly amount: number;
  readonly reason: "TASK_COMPLETED" | "REVISION_COMPLETED" | "MANUAL_CORRECTION";
  readonly referenceId: string;
  readonly actorAccountId: string;
  readonly requestId: string;
}

export type TreeRarity = "STARTER" | "ORDINARY" | "RARE";
export type TreeStatus = "GROWING" | "MATURE" | "HARVESTED";

export interface TreeStageDefinition {
  readonly name: string;
  readonly minimumRatio: number;
}

export interface TreeCatalog extends MutableRecord {
  name: string;
  fruitName: string;
  rarity: TreeRarity;
  threshold: number;
  stages: readonly TreeStageDefinition[];
  status: ActiveStatus;
}

export interface ChildTree extends MutableRecord {
  readonly childId: string;
  readonly catalogId: string;
  name?: string;
  progress: number;
  carryOver: number;
  stage: string;
  status: TreeStatus;
  maturedAt?: IsoInstant;
  harvestedAt?: IsoInstant;
}

export interface FruitCollection extends MutableRecord {
  readonly childId: string;
  readonly catalogId: string;
  quantity: number;
  reservedQuantity: number;
}

export interface GroupTree extends MutableRecord {
  readonly organizationId: string;
  readonly groupId: string;
  readonly catalogId: string;
  progress: number;
  threshold: number;
  stage: string;
  status: TreeStatus;
  maturedAt?: IsoInstant;
  harvestedAt?: IsoInstant;
}

export interface GroupContribution extends BaseRecord {
  readonly organizationId: string;
  readonly groupId: string;
  readonly groupTreeId: string;
  readonly assignmentId: string;
  readonly organizationMemberId: string;
  readonly amount: number;
}

export interface GroupMemorial extends BaseRecord {
  readonly organizationId: string;
  readonly groupId: string;
  readonly groupTreeId: string;
  readonly title: string;
  readonly badgeKey?: string;
  readonly themeKey?: string;
}

export interface Wish extends MutableRecord {
  readonly familyId: string;
  readonly childId: string;
  title: string;
  status: "ACTIVE" | "FULFILLED" | "ARCHIVED";
  fulfilledAt?: IsoInstant;
}

export interface FruitWishLink extends BaseRecord {
  readonly familyId: string;
  readonly childId: string;
  readonly wishId: string;
  readonly fruitCollectionId: string;
  readonly quantity: number;
  readonly action: "RESERVED" | "RELEASED" | "CONSUMED";
  readonly requestId: string;
}

export interface MediaAsset extends MutableRecord {
  readonly ownerScope: TenantScope;
  readonly uploaderAccountId: string;
  readonly purpose: "TASK_SOURCE" | "SUBMISSION_EVIDENCE" | "AVATAR";
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
  readonly byteSize: number;
  readonly storageKey: string;
  readonly visibleRoles: readonly string[];
  readonly expiresAt: IsoInstant;
  status: "PENDING_UPLOAD" | "ACTIVE" | "DELETED";
  deletedAt?: IsoInstant;
}

export interface TaskDraft extends MutableRecord {
  readonly ownerScope: TenantScope;
  readonly sourceAssetId: string;
  readonly createdByAccountId: string;
  readonly provider: string;
  readonly providerVersion: string;
  confidence: number;
  title?: string;
  description?: string;
  category?: TaskCategory;
  startsAt?: IsoInstant;
  dueAt?: IsoInstant;
  submissionMode?: SubmissionMode;
  status: "DRAFT" | "PUBLISHED" | "DISCARDED";
}

export interface AuditLog extends BaseRecord {
  readonly action: string;
  readonly actorAccountId: string;
  readonly requestId: string;
  readonly tenantScope: TenantScope;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface SupportAccessGrant extends MutableRecord {
  readonly ticketId: string;
  readonly supportAccountId: string;
  readonly approvedByAccountId: string;
  readonly tenantScope: TenantScope;
  readonly resourceType: string;
  readonly resourceIds: readonly string[];
  readonly purpose: string;
  readonly expiresAt: IsoInstant;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
}

export interface Plan extends MutableRecord {
  name: string;
  audience: "FAMILY" | "ORGANIZATION";
  entitlements: Readonly<Record<string, boolean>>;
  quotas: Readonly<Record<string, number>>;
  status: ActiveStatus;
}

export interface TenantEntitlement extends MutableRecord {
  readonly tenantScope: TenantScope;
  readonly planId: string;
  readonly startsAt: IsoInstant;
  readonly endsAt?: IsoInstant;
  status: ActiveStatus;
}

export interface UsageCounter extends MutableRecord {
  readonly tenantScope: TenantScope;
  readonly feature: string;
  readonly period: string;
  used: number;
  limit: number;
}

export interface ContentProvider extends MutableRecord {
  name: string;
  status: ActiveStatus;
  settlementAccountRef?: string;
}

export interface ExportRequest extends MutableRecord {
  readonly tenantScope: TenantScope;
  readonly requestedByAccountId: string;
  readonly kind: "FAMILY_DATA" | "ORGANIZATION_DATA";
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  approvedByAccountId?: string;
  downloadExpiresAt?: IsoInstant;
}

export interface CommandReceipt extends BaseRecord {
  readonly accountId: string;
  readonly requestId: string;
  readonly action: string;
  readonly result: unknown;
}

export interface PublicPoolEvent extends BaseRecord {
  readonly childId: string;
  readonly assignmentId: string;
  readonly kind: "UNCLAIMED_SUNLIGHT_RETURNED";
}

export interface DomainSchema {
  accounts: Account;
  families: Family;
  familyMembers: FamilyMember;
  organizations: Organization;
  organizationMembers: OrganizationMember;
  groups: Group;
  groupRoleBindings: GroupRoleBinding;
  children: Child;
  guardianLinks: GuardianLink;
  childGroupMemberships: ChildGroupMembership;
  invitations: Invitation;
  consentRecords: ConsentRecord;
  joinRequests: JoinRequest;
  rosterSeats: RosterSeat;
  taskTemplates: TaskTemplate;
  tasks: Task;
  taskAssignments: TaskAssignment;
  submissions: Submission;
  reviewRecords: ReviewRecord;
  sunlightLedgers: SunlightLedger;
  treeCatalog: TreeCatalog;
  childTrees: ChildTree;
  fruitCollections: FruitCollection;
  groupTrees: GroupTree;
  groupContributions: GroupContribution;
  groupMemorials: GroupMemorial;
  wishes: Wish;
  fruitWishLinks: FruitWishLink;
  mediaAssets: MediaAsset;
  taskDrafts: TaskDraft;
  auditLogs: AuditLog;
  supportAccessGrants: SupportAccessGrant;
  plans: Plan;
  tenantEntitlements: TenantEntitlement;
  usageCounters: UsageCounter;
  contentProviders: ContentProvider;
  exportRequests: ExportRequest;
  commandReceipts: CommandReceipt;
  publicPoolEvents: PublicPoolEvent;
}

export type CollectionName = keyof DomainSchema;
