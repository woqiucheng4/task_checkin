import type { ApplicationDependencies, Transaction } from "./ports.js";
import type {
  ActorContext,
  CollectionName,
  DomainSchema,
  ExportRequest,
  SupportAccessGrant,
  TenantScope,
} from "../domain/model.js";
import { sameTenantScope } from "../domain/entitlements.js";
import { AccessPolicy } from "../domain/policy.js";
import { DomainError } from "../shared/errors.js";

interface RequestBase {
  readonly requestId: string;
}

type SupportedResourceType = "TASK_ASSIGNMENT" | "TASK" | "SUBMISSION" | "MEDIA_ASSET";

const RESOURCE_COLLECTIONS = {
  MEDIA_ASSET: "mediaAssets",
  SUBMISSION: "submissions",
  TASK: "tasks",
  TASK_ASSIGNMENT: "taskAssignments",
} as const satisfies Record<SupportedResourceType, CollectionName>;

export class GovernanceService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async grantSupportAccess(
    actor: ActorContext,
    input: RequestBase & {
      readonly supportAccountId: string;
      readonly ticketId: string;
      readonly tenantScope: TenantScope;
      readonly resourceType: SupportedResourceType;
      readonly resourceIds: readonly string[];
      readonly purpose: string;
      readonly expiresAt: string;
    },
  ): Promise<SupportAccessGrant> {
    requirePlatform(actor);
    requireRequestId(input.requestId);
    if (
      input.ticketId.trim().length === 0 ||
      input.purpose.trim().length === 0 ||
      input.resourceIds.length === 0 ||
      Date.parse(input.expiresAt) <= Date.parse(this.dependencies.clock.now())
    ) {
      throw new DomainError("INVALID_INPUT", "支持授权缺少工单、目的、资源或有效期");
    }
    const now = this.dependencies.clock.now();
    const grant: SupportAccessGrant = {
      id: this.dependencies.ids.next("support_grant"),
      approvedByAccountId: actor.accountId,
      createdAt: now,
      expiresAt: input.expiresAt,
      purpose: input.purpose.trim(),
      resourceIds: [...new Set(input.resourceIds)],
      resourceType: input.resourceType,
      status: "ACTIVE",
      supportAccountId: input.supportAccountId,
      tenantScope: structuredClone(input.tenantScope),
      ticketId: input.ticketId.trim(),
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("supportAccessGrants", grant);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "SUPPORT_ACCESS_GRANTED",
        input.tenantScope,
        grant.id,
      );
      return grant;
    });
  }

  async revokeSupportAccess(
    actor: ActorContext,
    input: RequestBase & { readonly grantId: string },
  ): Promise<SupportAccessGrant> {
    requirePlatform(actor);
    requireRequestId(input.requestId);
    const grant = await this.dependencies.repository.read("supportAccessGrants", input.grantId);
    if (grant?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "有效支持授权不存在");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const revoked = await tx.update("supportAccessGrants", grant.id, {
        status: "REVOKED",
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "SUPPORT_ACCESS_REVOKED",
        grant.tenantScope,
        grant.id,
      );
      return revoked;
    });
  }

  async readWithSupportGrant(
    actor: ActorContext,
    input: { readonly resourceType: SupportedResourceType; readonly resourceId: string },
  ): Promise<DomainSchema[CollectionName]> {
    requirePlatform(actor);
    const now = this.dependencies.clock.now();
    const grant = (
      await this.dependencies.repository.query(
        "supportAccessGrants",
        (candidate) =>
          candidate.supportAccountId === actor.accountId &&
          candidate.status === "ACTIVE" &&
          candidate.resourceType === input.resourceType &&
          candidate.resourceIds.includes(input.resourceId) &&
          Date.parse(candidate.expiresAt) > Date.parse(now),
      )
    )[0];
    if (grant === undefined) {
      throw new DomainError("SUPPORT_GRANT_REQUIRED", "需要有效且范围匹配的支持访问授权");
    }
    const collection = RESOURCE_COLLECTIONS[input.resourceType];
    const resource = await this.dependencies.repository.read(collection, input.resourceId);
    if (
      resource === undefined ||
      !(await this.resourceMatchesScope(input.resourceType, resource, grant.tenantScope))
    ) {
      throw new DomainError("FORBIDDEN", "资源不属于授权空间");
    }
    await this.dependencies.repository.transaction((tx) =>
      this.audit(
        tx,
        actor,
        `support-read-${this.dependencies.ids.next("request")}`,
        "SUPPORT_CONTENT_READ",
        grant.tenantScope,
        input.resourceId,
      ),
    );
    return resource;
  }

  async requestExport(
    actor: ActorContext,
    input: RequestBase & {
      readonly tenantScope: TenantScope;
      readonly kind: ExportRequest["kind"];
    },
  ): Promise<ExportRequest> {
    requireRequestId(input.requestId);
    if (
      (input.kind === "FAMILY_DATA" && input.tenantScope.kind !== "FAMILY") ||
      (input.kind === "ORGANIZATION_DATA" && input.tenantScope.kind !== "ORGANIZATION")
    ) {
      throw new DomainError("INVALID_INPUT", "导出类型与租户空间不匹配");
    }
    await this.authorizeTenant(actor, input.tenantScope);
    const now = this.dependencies.clock.now();
    const request: ExportRequest = {
      id: this.dependencies.ids.next("export"),
      createdAt: now,
      kind: input.kind,
      requestedByAccountId: actor.accountId,
      status: "PENDING",
      tenantScope: structuredClone(input.tenantScope),
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("exportRequests", request);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "EXPORT_REQUESTED",
        input.tenantScope,
        request.id,
      );
      return request;
    });
  }

  async approveExport(
    actor: ActorContext,
    input: RequestBase & { readonly exportRequestId: string; readonly downloadExpiresAt: string },
  ): Promise<ExportRequest> {
    requirePlatform(actor);
    requireRequestId(input.requestId);
    const request = await this.dependencies.repository.read(
      "exportRequests",
      input.exportRequestId,
    );
    if (request?.status !== "PENDING") {
      throw new DomainError("NOT_FOUND", "待审批导出申请不存在");
    }
    if (Date.parse(input.downloadExpiresAt) <= Date.parse(this.dependencies.clock.now())) {
      throw new DomainError("INVALID_INPUT", "下载有效期必须晚于当前时间");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const approved = await tx.update("exportRequests", request.id, {
        approvedByAccountId: actor.accountId,
        downloadExpiresAt: input.downloadExpiresAt,
        status: "APPROVED",
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "EXPORT_APPROVED",
        request.tenantScope,
        request.id,
      );
      return approved;
    });
  }

  private async resourceMatchesScope(
    resourceType: SupportedResourceType,
    resource: DomainSchema[CollectionName],
    scope: TenantScope,
  ): Promise<boolean> {
    if (resourceType === "TASK") {
      return (
        "sourceScope" in resource && sameTenantScope(resource.sourceScope as TenantScope, scope)
      );
    }
    if (resourceType === "MEDIA_ASSET") {
      return "ownerScope" in resource && sameTenantScope(resource.ownerScope as TenantScope, scope);
    }
    const assignmentId =
      resourceType === "TASK_ASSIGNMENT"
        ? resource.id
        : "assignmentId" in resource
          ? String(resource.assignmentId)
          : "";
    const assignment = await this.dependencies.repository.read("taskAssignments", assignmentId);
    if (assignment === undefined) {
      return false;
    }
    const actualScope: TenantScope =
      assignment.organizationId === undefined
        ? { kind: "FAMILY", familyId: assignment.familyId }
        : { kind: "ORGANIZATION", organizationId: assignment.organizationId };
    return sameTenantScope(actualScope, scope);
  }

  private async authorizeTenant(actor: ActorContext, scope: TenantScope): Promise<void> {
    if (scope.kind === "FAMILY") {
      await this.policy.requireFamilyRole(actor, scope.familyId);
      return;
    }
    if (scope.kind === "ORGANIZATION") {
      await this.policy.requireOrganizationRole(actor, scope.organizationId, [
        "ORGANIZATION_ADMIN",
      ]);
      return;
    }
    throw new DomainError("FORBIDDEN", "该空间不支持数据导出");
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

function requirePlatform(actor: ActorContext): void {
  if (actor.mode !== "PLATFORM") {
    throw new DomainError("FORBIDDEN", "需要平台运营身份");
  }
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
