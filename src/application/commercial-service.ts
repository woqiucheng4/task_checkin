import type { ApplicationDependencies, Transaction } from "./ports.js";
import type {
  ActorContext,
  ContentProvider,
  Plan,
  TaskCategory,
  TaskImportance,
  TaskSchedule,
  TaskTemplate,
  SubmissionMode,
  TenantEntitlement,
  TenantScope,
  UsageCounter,
} from "../domain/model.js";
import { sameTenantScope } from "../domain/entitlements.js";
import { AccessPolicy } from "../domain/policy.js";
import { assertValidSchedule } from "../domain/tasks.js";
import { DomainError } from "../shared/errors.js";

interface RequestBase {
  readonly requestId: string;
}

export interface ProviderWorkspace {
  readonly providerName: string;
  readonly templates: readonly TaskTemplate[];
  readonly settlement: { readonly accountRef?: string };
}

export class CommercialService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async definePlan(
    actor: ActorContext,
    input: RequestBase & {
      readonly name: string;
      readonly audience: Plan["audience"];
      readonly entitlements: Readonly<Record<string, boolean>>;
      readonly quotas: Readonly<Record<string, number>>;
    },
  ): Promise<Plan> {
    requirePlatform(actor);
    requireRequestId(input.requestId);
    if (input.name.trim().length === 0) {
      throw new DomainError("INVALID_INPUT", "套餐名称不能为空");
    }
    for (const value of Object.values(input.quotas)) {
      if (!Number.isInteger(value) || value < 0) {
        throw new DomainError("INVALID_INPUT", "套餐配额必须是非负整数");
      }
    }
    const now = this.dependencies.clock.now();
    const plan: Plan = {
      id: this.dependencies.ids.next("plan"),
      audience: input.audience,
      createdAt: now,
      entitlements: structuredClone(input.entitlements),
      name: input.name.trim(),
      quotas: structuredClone(input.quotas),
      status: "ACTIVE",
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("plans", plan);
      await this.audit(tx, actor, input.requestId, "PLAN_DEFINED", { kind: "PLATFORM" }, plan.id);
      return plan;
    });
  }

  async assignPlan(
    actor: ActorContext,
    input: RequestBase & {
      readonly planId: string;
      readonly tenantScope: TenantScope;
      readonly startsAt: string;
      readonly endsAt?: string;
    },
  ): Promise<TenantEntitlement> {
    requirePlatform(actor);
    requireRequestId(input.requestId);
    const plan = await this.dependencies.repository.read("plans", input.planId);
    if (plan?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "套餐不存在或已停用");
    }
    if (
      (plan.audience === "FAMILY" && input.tenantScope.kind !== "FAMILY") ||
      (plan.audience === "ORGANIZATION" && input.tenantScope.kind !== "ORGANIZATION")
    ) {
      throw new DomainError("INVALID_INPUT", "套餐受众与租户类型不匹配");
    }
    if (input.endsAt !== undefined && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
      throw new DomainError("INVALID_INPUT", "套餐结束时间必须晚于开始时间");
    }
    const now = this.dependencies.clock.now();
    const entitlement: TenantEntitlement = {
      id: this.dependencies.ids.next("tenant_entitlement"),
      createdAt: now,
      ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt }),
      planId: plan.id,
      startsAt: input.startsAt,
      status: "ACTIVE",
      tenantScope: structuredClone(input.tenantScope),
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      const active = await tx.query(
        "tenantEntitlements",
        (candidate) =>
          candidate.status === "ACTIVE" &&
          sameTenantScope(candidate.tenantScope, input.tenantScope),
      );
      for (const current of active) {
        await tx.update("tenantEntitlements", current.id, { status: "INACTIVE", updatedAt: now });
      }
      await tx.insert("tenantEntitlements", entitlement);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "PLAN_ASSIGNED",
        input.tenantScope,
        entitlement.id,
      );
      return entitlement;
    });
  }

  async checkEntitlement(
    actor: ActorContext,
    tenantScope: TenantScope,
    feature: string,
  ): Promise<boolean> {
    await this.authorizeTenant(actor, tenantScope);
    const plan = await this.activePlan(tenantScope);
    return plan.entitlements[feature] === true;
  }

  async consumeQuota(
    actor: ActorContext,
    input: RequestBase & {
      readonly tenantScope: TenantScope;
      readonly feature: string;
      readonly period: string;
      readonly amount: number;
    },
  ): Promise<UsageCounter> {
    requireRequestId(input.requestId);
    await this.authorizeTenant(actor, input.tenantScope);
    if (!Number.isInteger(input.amount) || input.amount < 1) {
      throw new DomainError("INVALID_INPUT", "配额用量必须是正整数");
    }
    const plan = await this.activePlan(input.tenantScope);
    if (plan.entitlements[input.feature] !== true) {
      throw new DomainError("FORBIDDEN", "当前套餐未开通该功能");
    }
    const limit = plan.quotas[input.feature];
    if (limit === undefined) {
      throw new DomainError("INVALID_INPUT", "该功能没有可计量配额");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const current = (
        await tx.query(
          "usageCounters",
          (candidate) =>
            candidate.feature === input.feature &&
            candidate.period === input.period &&
            sameTenantScope(candidate.tenantScope, input.tenantScope),
        )
      )[0];
      const nextUsed = (current?.used ?? 0) + input.amount;
      if (nextUsed > limit) {
        throw new DomainError("QUOTA_EXCEEDED", "当前套餐配额已用尽");
      }
      const counter =
        current === undefined
          ? await tx.insert("usageCounters", {
              id: this.dependencies.ids.next("usage"),
              createdAt: now,
              feature: input.feature,
              limit,
              period: input.period,
              tenantScope: structuredClone(input.tenantScope),
              updatedAt: now,
              used: nextUsed,
            })
          : await tx.update("usageCounters", current.id, { updatedAt: now, used: nextUsed });
      await this.audit(tx, actor, input.requestId, "QUOTA_CONSUMED", input.tenantScope, counter.id);
      return counter;
    });
  }

  async registerContentProvider(
    actor: ActorContext,
    input: RequestBase & {
      readonly accountId: string;
      readonly name: string;
      readonly settlementAccountRef?: string;
    },
  ): Promise<ContentProvider> {
    requirePlatform(actor);
    requireRequestId(input.requestId);
    const account = await this.dependencies.repository.read("accounts", input.accountId);
    if (account?.status !== "ACTIVE") {
      throw new DomainError("NOT_FOUND", "内容方账号不存在");
    }
    const now = this.dependencies.clock.now();
    const provider: ContentProvider = {
      id: this.dependencies.ids.next("content_provider"),
      accountId: input.accountId,
      createdAt: now,
      name: input.name.trim(),
      ...(input.settlementAccountRef === undefined
        ? {}
        : { settlementAccountRef: input.settlementAccountRef }),
      status: "ACTIVE",
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("contentProviders", provider);
      await this.audit(
        tx,
        actor,
        input.requestId,
        "CONTENT_PROVIDER_REGISTERED",
        { kind: "PLATFORM" },
        provider.id,
      );
      return provider;
    });
  }

  async publishProviderTemplate(
    actor: ActorContext,
    input: RequestBase & {
      readonly title: string;
      readonly category: TaskCategory;
      readonly importance: TaskImportance;
      readonly estimatedMinutes: number;
      readonly submissionMode: SubmissionMode;
      readonly schedule: TaskSchedule;
      readonly allowLateSubmission: boolean;
      readonly requiresAcademicReview: boolean;
    },
  ): Promise<TaskTemplate> {
    const provider = await this.requireProvider(actor);
    requireRequestId(input.requestId);
    assertValidSchedule(input.schedule);
    if (input.title.trim().length === 0 || input.estimatedMinutes < 1) {
      throw new DomainError("INVALID_INPUT", "内容模板标题或预计用时无效");
    }
    const now = this.dependencies.clock.now();
    const scope: TenantScope = { kind: "CONTENT_PROVIDER", contentProviderId: provider.id };
    const template: TaskTemplate = {
      id: this.dependencies.ids.next("task_template"),
      allowLateSubmission: input.allowLateSubmission,
      category: input.category,
      createdAt: now,
      estimatedMinutes: input.estimatedMinutes,
      importance: input.importance,
      ownerScope: scope,
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
        "PROVIDER_TEMPLATE_PUBLISHED",
        scope,
        template.id,
      );
      return template;
    });
  }

  async providerWorkspace(actor: ActorContext): Promise<ProviderWorkspace> {
    const provider = await this.requireProvider(actor);
    const templates = await this.dependencies.repository.query(
      "taskTemplates",
      (template) =>
        template.ownerScope.kind === "CONTENT_PROVIDER" &&
        template.ownerScope.contentProviderId === provider.id,
    );
    return {
      providerName: provider.name,
      settlement:
        provider.settlementAccountRef === undefined
          ? {}
          : { accountRef: provider.settlementAccountRef },
      templates,
    };
  }

  private async activePlan(tenantScope: TenantScope): Promise<Plan> {
    const now = Date.parse(this.dependencies.clock.now());
    const entitlement = (
      await this.dependencies.repository.query(
        "tenantEntitlements",
        (candidate) =>
          candidate.status === "ACTIVE" &&
          sameTenantScope(candidate.tenantScope, tenantScope) &&
          Date.parse(candidate.startsAt) <= now &&
          (candidate.endsAt === undefined || Date.parse(candidate.endsAt) > now),
      )
    )[0];
    if (entitlement === undefined) {
      throw new DomainError("FORBIDDEN", "租户没有有效套餐");
    }
    const plan = await this.dependencies.repository.read("plans", entitlement.planId);
    if (plan?.status !== "ACTIVE") {
      throw new DomainError("FORBIDDEN", "租户套餐已停用");
    }
    return plan;
  }

  private async authorizeTenant(actor: ActorContext, tenantScope: TenantScope): Promise<void> {
    if (tenantScope.kind === "FAMILY") {
      await this.policy.requireFamilyRole(actor, tenantScope.familyId);
      return;
    }
    if (tenantScope.kind === "ORGANIZATION") {
      await this.policy.requireOrganizationRole(actor, tenantScope.organizationId, [
        "ORGANIZATION_ADMIN",
      ]);
      return;
    }
    throw new DomainError("FORBIDDEN", "当前租户不能使用套餐能力");
  }

  private async requireProvider(actor: ActorContext): Promise<ContentProvider> {
    if (actor.mode !== "CONTENT_PROVIDER" || actor.contentProviderId === undefined) {
      throw new DomainError("FORBIDDEN", "需要内容服务方身份");
    }
    const provider = await this.dependencies.repository.read(
      "contentProviders",
      actor.contentProviderId,
    );
    if (
      provider?.status !== "ACTIVE" ||
      provider.accountId !== actor.accountId ||
      provider.id !== actor.contentProviderId
    ) {
      throw new DomainError("FORBIDDEN", "内容服务方身份无效");
    }
    return provider;
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
