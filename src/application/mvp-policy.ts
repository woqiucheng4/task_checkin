import type { ActorContext } from "../domain/model.js";
import { DomainError } from "../shared/errors.js";
import type { CoreAction } from "./core-api.js";

export interface MvpPolicyConfig {
  readonly enabled: boolean;
}

const MVP_ACTIONS = new Set<CoreAction>([
  "ISSUE_TEACHER_ACTIVATION",
  "REVOKE_TEACHER_ACTIVATION",
  "ACTIVATE_TEACHER_WORKSPACE",
  "BOOTSTRAP_ACCOUNT",
  "UPDATE_ACCOUNT_PROFILE",
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
  "CREATE_FAMILY",
  "ADD_CHILD",
  "CREATE_GROUP",
  "BIND_GROUP_ROLE",
  "CREATE_GROUP_INVITATION",
  "PREVIEW_GROUP_INVITATION",
  "CLAIM_INVITATION",
  "APPROVE_JOIN_REQUEST",
  "REJECT_JOIN_REQUEST",
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
]);

export class MvpPolicy {
  constructor(private readonly config: MvpPolicyConfig) {}

  assertAllowed(action: CoreAction, actor: ActorContext): void {
    if (!["ACCOUNT", "PLATFORM", "CONTENT_PROVIDER"].includes(actor.mode)) {
      throw new DomainError("INVALID_COMMAND", "孩子不能作为登录或请求身份");
    }
    if (!this.config.enabled) return;
    if (!MVP_ACTIONS.has(action)) {
      throw new DomainError("FEATURE_DISABLED", "该功能暂未在内测版开放");
    }
  }
}
