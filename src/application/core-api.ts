import { CommercialService } from "./commercial-service.js";
import { GovernanceService } from "./governance-service.js";
import { GroupOrchardService } from "./group-orchard-service.js";
import { IdentityService } from "./identity-service.js";
import { InvitationService } from "./invitation-service.js";
import { MediaService } from "./media-service.js";
import { MvpPolicy } from "./mvp-policy.js";
import { AiGateway } from "./ai-gateway.js";
import { OrchardService } from "./orchard-service.js";
import type { ApplicationDependencies, MediaStorage, TaskDraftProvider } from "./ports.js";
import { PresentationService } from "./presentation-service.js";
import { ReviewService } from "./review-service.js";
import { SubmissionService } from "./submission-service.js";
import { SunlightService } from "./sunlight-service.js";
import { TaskService } from "./task-service.js";
import {
  TeacherActivationService,
  TEACHER_ACTIVATION_ACTIONS,
} from "./teacher-activation-service.js";
import { ViewModelService } from "./view-models.js";
import { WishService } from "./wish-service.js";
import type { ActorContext, CommandReceipt } from "../domain/model.js";
import { DomainError } from "../shared/errors.js";
import { commandFailure, commandSuccess, type CommandResult } from "../shared/result.js";

export const CORE_ACTIONS = [
  ...TEACHER_ACTIVATION_ACTIONS,
  "BOOTSTRAP_ACCOUNT",
  "GET_ACCOUNT_SHELL",
  "GET_FAMILY_SETTINGS",
  "GET_CHILD_GROUPS",
  "GET_PARENT_DASHBOARD",
  "GET_PARENT_TASK_CENTER",
  "GET_REVIEW_QUEUE",
  "GET_TEACHER_DASHBOARD",
  "GET_GROUP_SUBMISSIONS",
  "GET_GROUP_JOIN_REQUESTS",
  "GET_GROUP_TASK_TEMPLATES",
  "GET_GROUP_WORKSPACE",
  "GET_INSTITUTION_DASHBOARD",
  "GET_PLATFORM_DASHBOARD",
  "GET_PROVIDER_DASHBOARD",
  "CREATE_FAMILY",
  "ADD_CHILD",
  "CREATE_ORGANIZATION",
  "CREATE_GROUP",
  "BIND_GROUP_ROLE",
  "GET_ORGANIZATION_CHILD",
  "CREATE_GROUP_INVITATION",
  "PREVIEW_GROUP_INVITATION",
  "CLAIM_INVITATION",
  "APPROVE_JOIN_REQUEST",
  "REJECT_JOIN_REQUEST",
  "CREATE_ROSTER_SEAT",
  "CLAIM_ROSTER_SEAT",
  "WITHDRAW_CHILD",
  "CREATE_TASK_TEMPLATE",
  "ARCHIVE_TASK_TEMPLATE",
  "PUBLISH_FAMILY_TASK",
  "PUBLISH_GROUP_TASK",
  "CANCEL_TASK",
  "SET_FAMILY_FOCUS",
  "SUBMIT_TASK",
  "SUPPLEMENT_SUBMISSION",
  "MARK_TASK_EXCUSED",
  "ACCEPT_LATE_CHALLENGE",
  "EXPIRE_UNSUBMITTED",
  "FAMILY_REVIEW",
  "ACADEMIC_REVIEW",
  "COMPLETE_REVISION",
  "GET_CHILD_TODAY",
  "START_TREE",
  "RENAME_TREE",
  "HARVEST_TREE",
  "GET_CHILD_ORCHARD",
  "CREATE_WISH",
  "UPDATE_WISH",
  "ARCHIVE_WISH",
  "LINK_FRUIT",
  "UNLINK_FRUIT",
  "FULFILL_WISH",
  "GET_FAMILY_WISHES",
  "START_GROUP_TREE",
  "GET_GROUP_PROGRESS",
  "HARVEST_GROUP_TREE",
  "CREATE_UPLOAD_INTENT",
  "UPLOAD_MEDIA_CONTENT",
  "GET_ASSIGNMENT_DETAIL",
  "RECORD_UPLOAD",
  "RECOGNIZE_TASK_DRAFT",
  "EDIT_TASK_DRAFT",
  "PUBLISH_TASK_DRAFT",
  "ATTACH_SUBMISSION_EVIDENCE",
  "READ_MEDIA_ASSET",
  "DELETE_EXPIRED_MEDIA",
  "GRANT_SUPPORT_ACCESS",
  "REVOKE_SUPPORT_ACCESS",
  "READ_WITH_SUPPORT_GRANT",
  "REQUEST_EXPORT",
  "APPROVE_EXPORT",
  "DEFINE_PLAN",
  "ASSIGN_PLAN",
  "CHECK_ENTITLEMENT",
  "CONSUME_QUOTA",
  "REGISTER_CONTENT_PROVIDER",
  "PUBLISH_PROVIDER_TEMPLATE",
  "GET_PROVIDER_WORKSPACE",
] as const;

export type CoreAction = (typeof CORE_ACTIONS)[number];

const ACTION_SET = new Set<string>(CORE_ACTIONS);
export const CORE_READ_ACTIONS = [
  "GET_GROUP_TASK_TEMPLATES",
  "CHECK_ENTITLEMENT",
  "GET_GROUP_SUBMISSIONS",
  "GET_GROUP_JOIN_REQUESTS",
  "PREVIEW_GROUP_INVITATION",
  "GET_FAMILY_SETTINGS",
  "GET_CHILD_GROUPS",
  "GET_ASSIGNMENT_DETAIL",
  "GET_ACCOUNT_SHELL",
  "GET_CHILD_ORCHARD",
  "GET_CHILD_TODAY",
  "GET_FAMILY_WISHES",
  "GET_GROUP_WORKSPACE",
  "GET_GROUP_PROGRESS",
  "GET_INSTITUTION_DASHBOARD",
  "GET_ORGANIZATION_CHILD",
  "GET_PARENT_DASHBOARD",
  "GET_PARENT_TASK_CENTER",
  "GET_PLATFORM_DASHBOARD",
  "GET_PROVIDER_DASHBOARD",
  "GET_PROVIDER_WORKSPACE",
  "GET_REVIEW_QUEUE",
  "GET_TEACHER_DASHBOARD",
  "READ_MEDIA_ASSET",
  "READ_WITH_SUPPORT_GRANT",
] as const satisfies readonly CoreAction[];

const READ_ACTIONS = new Set<CoreAction>(CORE_READ_ACTIONS);

export interface CoreAuthContext {
  readonly openId: string;
  readonly isPlatformOperator?: boolean;
}

export interface CoreActorSelection {
  readonly mode: "ACCOUNT" | "CHILD" | "CONTENT_PROVIDER" | "PLATFORM";
  readonly childId?: string;
  readonly contentProviderId?: string;
}

export interface CoreCommand {
  readonly action: CoreAction;
  readonly actor?: CoreActorSelection;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly requestId?: string;
}

export interface CoreApiDependencies extends ApplicationDependencies {
  readonly mediaStorage?: MediaStorage;
  /** Defaults to enabled; the runtime maps AI_TASK_DRAFT_ENABLED into this switch. */
  readonly aiTaskDraftEnabled?: boolean;
  readonly mvpPolicy?: MvpPolicy;
  readonly taskDraftProvider?: TaskDraftProvider;
}

export interface CoreApi {
  handle(rawCommand: unknown, authContext: CoreAuthContext): Promise<CommandResult<unknown>>;
}

export function createCoreApi(dependencies: CoreApiDependencies): CoreApi {
  const services = createServices(dependencies);
  const mvpPolicy = dependencies.mvpPolicy ?? new MvpPolicy({ enabled: false });
  return {
    async handle(rawCommand, authContext) {
      try {
        const command = parseCommand(rawCommand);
        const isWrite = !READ_ACTIONS.has(command.action);
        if (isWrite) {
          requireRequestId(command.requestId);
        }
        requireTrustedOpenId(authContext.openId);

        const account = (
          await dependencies.repository.query("accounts", { openId: authContext.openId })
        )[0];
        if (command.action === "BOOTSTRAP_ACCOUNT") {
          const requestId = requireRequestId(command.requestId);
          if (account !== undefined) {
            const replay = await findReceipt(dependencies, account.id, command.action, requestId);
            if (replay !== undefined) {
              return commandSuccess(replay.result);
            }
          }
          const created = await services.identity.createAccount({
            openId: authContext.openId,
            requestId,
          });
          await saveReceipt(dependencies, created.id, command.action, requestId, created);
          return commandSuccess(created);
        }
        if (account?.status !== "ACTIVE") {
          throw new DomainError("UNAUTHORIZED", "微信账号尚未初始化或已停用");
        }

        const actor = await resolveActor(dependencies, account.id, command.actor, authContext);
        mvpPolicy.assertAllowed(command.action, actor);
        // These services reauthorize retries against current membership/consent before
        // returning their own idempotent result. Cached write receipts cannot do that.
        if (
          (TEACHER_ACTIVATION_ACTIONS as readonly string[]).includes(command.action) ||
          ["ACADEMIC_REVIEW", "COMPLETE_REVISION", "CLAIM_INVITATION"].includes(command.action)
        ) {
          return commandSuccess(
            await dispatch(services, command.action, actor, command.payload, command.requestId),
          );
        }
        if (isWrite) {
          const requestId = requireRequestId(command.requestId);
          const replay = await findReceipt(dependencies, account.id, command.action, requestId);
          if (replay !== undefined) {
            return commandSuccess(replay.result);
          }
          const result = await dispatch(
            services,
            command.action,
            actor,
            command.payload,
            requestId,
          );
          await saveReceipt(dependencies, account.id, command.action, requestId, result);
          return commandSuccess(result);
        }
        return commandSuccess(
          await dispatch(services, command.action, actor, command.payload, command.requestId),
        );
      } catch (error) {
        return commandFailure(error);
      }
    },
  };
}

interface Services {
  readonly teacherActivations: TeacherActivationService;
  readonly commercial: CommercialService;
  readonly governance: GovernanceService;
  readonly groupOrchard: GroupOrchardService;
  readonly identity: IdentityService;
  readonly invitations: InvitationService;
  readonly media?: MediaService;
  readonly orchard: OrchardService;
  readonly presentation: PresentationService;
  readonly reviews: ReviewService;
  readonly submissions: SubmissionService;
  readonly tasks: TaskService;
  readonly views: ViewModelService;
  readonly wishes: WishService;
}

function createServices(dependencies: CoreApiDependencies): Services {
  const sunlight = new SunlightService(dependencies);
  return {
    teacherActivations: new TeacherActivationService(dependencies),
    commercial: new CommercialService(dependencies),
    governance: new GovernanceService(dependencies),
    groupOrchard: new GroupOrchardService(dependencies),
    identity: new IdentityService(dependencies),
    invitations: new InvitationService(dependencies),
    ...(dependencies.mediaStorage === undefined || dependencies.taskDraftProvider === undefined
      ? {}
      : {
          media: new MediaService(
            dependencies,
            dependencies.mediaStorage,
            new AiGateway(dependencies, dependencies.mediaStorage, dependencies.taskDraftProvider, {
              enabled: dependencies.aiTaskDraftEnabled ?? true,
            }),
          ),
        }),
    orchard: new OrchardService(dependencies),
    presentation: new PresentationService(dependencies),
    reviews: new ReviewService(dependencies, sunlight),
    submissions: new SubmissionService(dependencies),
    tasks: new TaskService(dependencies),
    views: new ViewModelService(dependencies),
    wishes: new WishService(dependencies),
  };
}

function parseCommand(raw: unknown): CoreCommand {
  if (!isRecord(raw) || typeof raw.action !== "string" || !ACTION_SET.has(raw.action)) {
    throw new DomainError("INVALID_COMMAND", "请求动作不在服务端允许列表中");
  }
  if (!isRecord(raw.payload)) {
    throw new DomainError("INVALID_COMMAND", "payload 必须是对象");
  }
  if (raw.actor !== undefined && !isRecord(raw.actor)) {
    throw new DomainError("INVALID_COMMAND", "actor 选择无效");
  }
  return {
    action: raw.action as CoreAction,
    ...(raw.actor === undefined ? {} : { actor: raw.actor as unknown as CoreActorSelection }),
    payload: raw.payload,
    ...(typeof raw.requestId === "string" ? { requestId: raw.requestId } : {}),
  };
}

async function resolveActor(
  dependencies: CoreApiDependencies,
  accountId: string,
  selection: CoreActorSelection | undefined,
  auth: CoreAuthContext,
): Promise<ActorContext> {
  const mode = selection?.mode ?? "ACCOUNT";
  if (mode === "PLATFORM") {
    if (auth.isPlatformOperator !== true) {
      throw new DomainError("FORBIDDEN", "当前运行时身份不是平台运营人员");
    }
    return { accountId, mode: "PLATFORM" };
  }
  if (mode === "CHILD") {
    if (selection?.childId === undefined) {
      throw new DomainError("INVALID_COMMAND", "孩子模式必须选择孩子");
    }
    const guardian = (
      await dependencies.repository.query(
        "guardianLinks",
        (link) =>
          link.accountId === accountId &&
          link.childId === selection.childId &&
          link.status === "ACTIVE",
      )
    )[0];
    if (guardian === undefined) {
      throw new DomainError("FORBIDDEN", "当前账号没有该孩子的有效监护关系");
    }
    return { accountId, childId: selection.childId, mode: "CHILD" };
  }
  if (mode === "CONTENT_PROVIDER") {
    if (selection?.contentProviderId === undefined) {
      throw new DomainError("INVALID_COMMAND", "内容方模式必须选择内容方");
    }
    const provider = await dependencies.repository.read(
      "contentProviders",
      selection.contentProviderId,
    );
    if (provider?.status !== "ACTIVE" || provider.accountId !== accountId) {
      throw new DomainError("FORBIDDEN", "当前账号没有该内容方身份");
    }
    return { accountId, contentProviderId: provider.id, mode: "CONTENT_PROVIDER" };
  }
  return { accountId, mode: "ACCOUNT" };
}

async function dispatch(
  services: Services,
  action: CoreAction,
  actor: ActorContext,
  payload: Readonly<Record<string, unknown>>,
  requestId: string | undefined,
): Promise<unknown> {
  const input = { ...payload, ...(requestId === undefined ? {} : { requestId }) };
  switch (action) {
    case "ISSUE_TEACHER_ACTIVATION":
      return services.teacherActivations.issue(actor, castInput(input));
    case "REVOKE_TEACHER_ACTIVATION":
      return services.teacherActivations.revoke(actor, castInput(input));
    case "ACTIVATE_TEACHER_WORKSPACE":
      return services.identity.activateTeacherWorkspace(actor, castInput(input));
    case "GET_ACCOUNT_SHELL":
      return services.presentation.accountShell(actor);
    case "GET_FAMILY_SETTINGS":
      return services.presentation.familySettings(actor, requireString(payload.familyId));
    case "GET_CHILD_GROUPS":
      return services.presentation.childGroups(actor, requireString(payload.childId));
    case "GET_PARENT_DASHBOARD":
      return services.presentation.parentDashboard(actor, {
        childId: requireString(payload.childId),
        date: requireString(payload.date),
      });
    case "GET_PARENT_TASK_CENTER":
      return services.presentation.parentTaskCenter(actor, {
        childId: requireString(payload.childId),
      });
    case "GET_REVIEW_QUEUE":
      return services.presentation.reviewQueue(actor, reviewQueueInput(payload));
    case "GET_TEACHER_DASHBOARD":
      return services.presentation.teacherDashboard(actor, {
        date: requireString(payload.date),
      });
    case "GET_GROUP_WORKSPACE":
      return services.presentation.groupWorkspace(actor, {
        groupId: requireString(payload.groupId),
      });
    case "GET_GROUP_SUBMISSIONS":
      return services.presentation.groupSubmissions(actor, {
        groupId: requireString(payload.groupId),
        ...(payload.taskId === undefined ? {} : { taskId: requireString(payload.taskId) }),
      });
    case "GET_GROUP_JOIN_REQUESTS":
      return services.presentation.groupJoinRequests(actor, requireString(payload.groupId));
    case "GET_GROUP_TASK_TEMPLATES":
      return services.presentation.groupTaskTemplates(actor, requireString(payload.groupId));
    case "GET_INSTITUTION_DASHBOARD":
      return services.presentation.institutionDashboard(actor, {
        organizationId: requireString(payload.organizationId),
      });
    case "GET_PLATFORM_DASHBOARD":
      return services.presentation.platformDashboard(actor);
    case "GET_PROVIDER_DASHBOARD":
      return services.presentation.providerDashboard(actor);
    case "CREATE_FAMILY":
      return services.identity.createFamily(actor, castInput(input));
    case "ADD_CHILD":
      return services.identity.addChild(actor, castInput(input));
    case "CREATE_ORGANIZATION":
      return services.identity.createOrganization(actor, castInput(input));
    case "CREATE_GROUP":
      return services.identity.createGroup(actor, castInput(input));
    case "BIND_GROUP_ROLE":
      return services.identity.bindGroupRole(actor, castInput(input));
    case "GET_ORGANIZATION_CHILD":
      return services.identity.getOrganizationChild(
        actor,
        requireString(payload.organizationMemberId),
      );
    case "CREATE_GROUP_INVITATION":
      return services.invitations.createGroupInvitation(actor, castInput(input));
    case "PREVIEW_GROUP_INVITATION":
      return services.invitations.preview(
        actor,
        requireString(payload.code),
        requireString(payload.childId),
      );
    case "CLAIM_INVITATION":
      return services.invitations.claimInvitation(actor, castInput(input));
    case "APPROVE_JOIN_REQUEST":
      return services.invitations.approveJoinRequest(actor, castInput(input));
    case "REJECT_JOIN_REQUEST":
      return services.invitations.rejectJoinRequest(actor, castInput(input));
    case "CREATE_ROSTER_SEAT":
      return services.invitations.createRosterSeat(actor, castInput(input));
    case "CLAIM_ROSTER_SEAT":
      return services.invitations.claimRosterSeat(actor, castInput(input));
    case "WITHDRAW_CHILD":
      return services.invitations.withdrawChild(actor, castInput(input));
    case "CREATE_TASK_TEMPLATE":
      return services.tasks.createTemplate(actor, castInput(input));
    case "ARCHIVE_TASK_TEMPLATE":
      return services.tasks.archiveTemplate(actor, castInput(input));
    case "PUBLISH_FAMILY_TASK":
      return services.tasks.publishFamilyTask(actor, castInput(input));
    case "PUBLISH_GROUP_TASK":
      return services.tasks.publishGroupTask(actor, castInput(input));
    case "CANCEL_TASK":
      return services.tasks.cancelTask(actor, castInput(input));
    case "SET_FAMILY_FOCUS":
      return services.tasks.setFamilyFocus(actor, castInput(input));
    case "SUBMIT_TASK":
      return services.submissions.submit(actor, castInput(input));
    case "SUPPLEMENT_SUBMISSION":
      return services.submissions.supplement(actor, castInput(input));
    case "MARK_TASK_EXCUSED":
      return services.submissions.markExcused(actor, castInput(input));
    case "ACCEPT_LATE_CHALLENGE":
      return services.submissions.acceptLateChallenge(actor, castInput(input));
    case "EXPIRE_UNSUBMITTED":
      return services.submissions.expireUnsubmitted(actor, castInput(input));
    case "FAMILY_REVIEW":
      return services.reviews.familyReview(actor, castInput(input));
    case "ACADEMIC_REVIEW":
      return services.reviews.academicReview(actor, castInput(input));
    case "COMPLETE_REVISION":
      return services.reviews.completeRevision(actor, castInput(input));
    case "GET_CHILD_TODAY":
      return services.views.childToday(actor, requireString(payload.date));
    case "START_TREE":
      return services.orchard.startTree(actor, castInput(input));
    case "RENAME_TREE":
      return services.orchard.renameTree(actor, castInput(input));
    case "HARVEST_TREE":
      return services.orchard.harvestTree(actor, castInput(input));
    case "GET_CHILD_ORCHARD":
      return services.orchard.orchardForChild(actor);
    case "CREATE_WISH":
      return services.wishes.createWish(actor, castInput(input));
    case "UPDATE_WISH":
      return services.wishes.updateWish(actor, castInput(input));
    case "ARCHIVE_WISH":
      return services.wishes.archiveWish(actor, castInput(input));
    case "LINK_FRUIT":
      return services.wishes.linkFruit(actor, castInput(input));
    case "UNLINK_FRUIT":
      return services.wishes.unlinkFruit(actor, castInput(input));
    case "FULFILL_WISH":
      return services.wishes.fulfillWish(actor, castInput(input));
    case "GET_FAMILY_WISHES":
      return services.wishes.familyWishView(actor, requireString(payload.childId));
    case "START_GROUP_TREE":
      return services.groupOrchard.startGroupTree(actor, castInput(input));
    case "GET_GROUP_PROGRESS":
      return services.groupOrchard.groupProgressForChild(actor, requireString(payload.groupId));
    case "HARVEST_GROUP_TREE":
      return services.groupOrchard.harvestGroupTree(actor, castInput(input));
    case "CREATE_UPLOAD_INTENT":
      return requireMedia(services).createUploadIntent(actor, castInput(input));
    case "UPLOAD_MEDIA_CONTENT":
      return requireMedia(services).uploadContent(actor, castInput(input));
    case "GET_ASSIGNMENT_DETAIL":
      return services.submissions.detail(actor, requireString(payload.assignmentId));
    case "RECORD_UPLOAD":
      return requireMedia(services).recordUpload(actor, castInput(input));
    case "RECOGNIZE_TASK_DRAFT":
      return requireMedia(services).recognizeTaskDraft(actor, castInput(input));
    case "EDIT_TASK_DRAFT":
      return requireMedia(services).editDraft(actor, castInput(input));
    case "PUBLISH_TASK_DRAFT":
      return requireMedia(services).publishDraft(actor, castInput(input));
    case "ATTACH_SUBMISSION_EVIDENCE":
      return requireMedia(services).attachSubmissionEvidence(actor, castInput(input));
    case "READ_MEDIA_ASSET":
      return requireMedia(services).readAsset(actor, requireString(payload.assetId));
    case "DELETE_EXPIRED_MEDIA":
      return requireMedia(services).deleteExpiredAssets(actor, castInput(input));
    case "GRANT_SUPPORT_ACCESS":
      return services.governance.grantSupportAccess(actor, castInput(input));
    case "REVOKE_SUPPORT_ACCESS":
      return services.governance.revokeSupportAccess(actor, castInput(input));
    case "READ_WITH_SUPPORT_GRANT":
      return services.governance.readWithSupportGrant(actor, castInput(input));
    case "REQUEST_EXPORT":
      return services.governance.requestExport(actor, castInput(input));
    case "APPROVE_EXPORT":
      return services.governance.approveExport(actor, castInput(input));
    case "DEFINE_PLAN":
      return services.commercial.definePlan(actor, castInput(input));
    case "ASSIGN_PLAN":
      return services.commercial.assignPlan(actor, castInput(input));
    case "CHECK_ENTITLEMENT":
      return services.commercial.checkEntitlement(
        actor,
        castInput(payload.tenantScope),
        requireString(payload.feature),
      );
    case "CONSUME_QUOTA":
      return services.commercial.consumeQuota(actor, castInput(input));
    case "REGISTER_CONTENT_PROVIDER":
      return services.commercial.registerContentProvider(actor, castInput(input));
    case "PUBLISH_PROVIDER_TEMPLATE":
      return services.commercial.publishProviderTemplate(actor, castInput(input));
    case "GET_PROVIDER_WORKSPACE":
      return services.commercial.providerWorkspace(actor);
    case "BOOTSTRAP_ACCOUNT":
      throw new DomainError("INVALID_COMMAND", "账号初始化动作由认证边界处理");
  }
}

function requireMedia(services: Services): MediaService {
  if (services.media === undefined) {
    throw new DomainError("INTERNAL_ERROR", "媒体服务尚未在运行环境配置");
  }
  return services.media;
}

async function findReceipt(
  dependencies: CoreApiDependencies,
  accountId: string,
  action: CoreAction,
  requestId: string,
): Promise<CommandReceipt | undefined> {
  return (
    await dependencies.repository.query(
      "commandReceipts",
      (receipt) =>
        receipt.accountId === accountId &&
        receipt.action === action &&
        receipt.requestId === requestId,
    )
  )[0];
}

async function saveReceipt(
  dependencies: CoreApiDependencies,
  accountId: string,
  action: CoreAction,
  requestId: string,
  result: unknown,
): Promise<void> {
  await dependencies.repository.transaction((tx) =>
    tx.insert("commandReceipts", {
      id: dependencies.ids.next("command_receipt"),
      accountId,
      action,
      createdAt: dependencies.clock.now(),
      requestId,
      result: structuredClone(result),
    }),
  );
}

function requireRequestId(value: string | undefined): string {
  if (value === undefined || !/^[A-Za-z0-9-]{16,128}$/.test(value)) {
    throw new DomainError("INVALID_COMMAND", "写请求必须包含 16 至 128 位 requestId");
  }
  return value;
}

function requireTrustedOpenId(value: string): void {
  if (value.trim().length === 0) {
    throw new DomainError("UNAUTHORIZED", "可信运行时未提供微信身份");
  }
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError("INVALID_COMMAND", "请求缺少必填文本字段");
  }
  return value;
}

function reviewQueueInput(
  payload: Readonly<Record<string, unknown>>,
):
  | { readonly kind: "FAMILY"; readonly childId: string }
  | { readonly kind: "GROUP"; readonly groupId: string } {
  if (payload.kind === "FAMILY") {
    return { childId: requireString(payload.childId), kind: "FAMILY" };
  }
  if (payload.kind === "GROUP") {
    return { groupId: requireString(payload.groupId), kind: "GROUP" };
  }
  throw new DomainError("INVALID_COMMAND", "审核队列类型必须是 FAMILY 或 GROUP");
}

function castInput<T>(value: unknown): T {
  return value as T;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
