import { createHash, createHmac } from "node:crypto";
import type { ActorContext, Organization, TeacherActivationCode } from "../domain/model.js";
import { DomainError } from "../shared/errors.js";
import { CryptoIdGenerator } from "../shared/ids.js";
import { AccessPolicy } from "../domain/policy.js";
import type { ApplicationDependencies, Transaction } from "./ports.js";

export const TEACHER_ACTIVATION_ACTIONS = [
  "ISSUE_TEACHER_ACTIVATION",
  "REVOKE_TEACHER_ACTIVATION",
  "ACTIVATE_TEACHER_WORKSPACE",
] as const;

type ActivationAction = (typeof TEACHER_ACTIVATION_ACTIONS)[number];

export class TeacherActivationService {
  constructor(private readonly dependencies: ApplicationDependencies) {}

  async issue(
    actor: ActorContext,
    input: { readonly expiresAt: string; readonly requestId: string },
  ): Promise<{ readonly activation: TeacherActivationCode; readonly code: string }> {
    requireMode(actor, "PLATFORM");
    const pepper = requirePepper();
    const activation = await this.execute<TeacherActivationCode>(
      actor,
      "ISSUE_TEACHER_ACTIVATION",
      input.requestId,
      async (tx) => {
        const now = this.dependencies.clock.now();
        if (
          typeof input.expiresAt !== "string" ||
          !Number.isFinite(Date.parse(input.expiresAt)) ||
          Date.parse(input.expiresAt) <= Date.parse(now)
        ) {
          throw new DomainError("INVALID_INPUT", "激活码有效期必须晚于当前时间");
        }
        // A random, immutable ID lets trusted retries reconstruct the code without storing it.
        const id = new CryptoIdGenerator().next("teacher_activation");
        const record: TeacherActivationCode = {
          id,
          codeHash: hashCode(deriveCode(id, pepper), pepper),
          createdAt: now,
          expiresAt: new Date(input.expiresAt).toISOString(),
          issuedByAccountId: actor.accountId,
          status: "ACTIVE",
        };
        await tx.insert("teacherActivationCodes", record);
        await this.audit(tx, actor, input.requestId, record.id, "TEACHER_ACTIVATION_ISSUED");
        return record;
      },
    );
    return { activation, code: deriveCode(activation.id, pepper) };
  }

  async revoke(
    actor: ActorContext,
    input: { readonly activationCodeId: string; readonly requestId: string },
  ): Promise<TeacherActivationCode> {
    requireMode(actor, "PLATFORM");
    requireText(input.activationCodeId, "激活码记录");
    return this.execute(actor, "REVOKE_TEACHER_ACTIVATION", input.requestId, async (tx) => {
      const record = await tx.read("teacherActivationCodes", input.activationCodeId);
      if (record === undefined) throw new DomainError("NOT_FOUND", "激活码不存在");
      if (record.status !== "ACTIVE") throw new DomainError("CONFLICT", "激活码已核销或撤销");
      const revoked = await tx.update("teacherActivationCodes", record.id, {
        status: "REVOKED",
        revokedAt: this.dependencies.clock.now(),
      });
      await this.audit(tx, actor, input.requestId, record.id, "TEACHER_ACTIVATION_REVOKED");
      return revoked;
    });
  }

  // The caller must create the workspace using this same transaction. No pre-consumption write.
  async consume(
    actor: ActorContext,
    code: string,
    requestId: string,
    createWorkspace: (tx: Transaction) => Promise<Organization>,
  ): Promise<Organization> {
    requireMode(actor, "ACCOUNT");
    requireText(code, "激活码");
    const codeHash = hashCode(code.trim(), requirePepper());
    return this.execute(actor, "ACTIVATE_TEACHER_WORKSPACE", requestId, async (tx) => {
      const record = (await tx.query("teacherActivationCodes", { codeHash, status: "ACTIVE" }))[0];
      const now = this.dependencies.clock.now();
      if (
        record === undefined ||
        !Number.isFinite(Date.parse(record.expiresAt)) ||
        Date.parse(record.expiresAt) <= Date.parse(now)
      ) {
        throw new DomainError("FORBIDDEN", "激活码无效、已过期或已使用");
      }
      const workspace = await createWorkspace(tx);
      await tx.update("teacherActivationCodes", record.id, {
        status: "REDEEMED",
        redeemedByAccountId: actor.accountId,
        redeemedAt: now,
      });
      await this.audit(tx, actor, requestId, record.id, "TEACHER_ACTIVATION_REDEEMED");
      return workspace;
    });
  }

  private async execute<T>(
    actor: ActorContext,
    action: ActivationAction,
    requestId: string,
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    if (typeof requestId !== "string" || !/^[A-Za-z0-9-]{16,128}$/.test(requestId)) {
      throw new DomainError("INVALID_COMMAND", "写请求必须包含 16 至 128 位 requestId");
    }
    return this.dependencies.repository.transaction(async (tx) => {
      if (
        actor.mode === "ACCOUNT" &&
        (await tx.read("accounts", actor.accountId))?.status !== "ACTIVE"
      ) {
        throw new DomainError("UNAUTHORIZED", "账号不存在或已停用");
      }
      const receipt = (
        await tx.query("commandReceipts", { accountId: actor.accountId, requestId })
      )[0];
      if (receipt !== undefined) {
        if (receipt.action !== action)
          throw new DomainError("CONFLICT", "requestId 已用于其他操作");
        if (action === "ACTIVATE_TEACHER_WORKSPACE") {
          const workspace = receipt.result as Organization;
          await new AccessPolicy(tx).requireOrganizationRole(actor, workspace.id, [
            "ORGANIZATION_ADMIN",
          ]);
        }
        return receipt.result as T;
      }
      const result = await work(tx);
      await tx.insert("commandReceipts", {
        id: `teacher_receipt_${createHash("sha256")
          .update(JSON.stringify([actor.accountId, requestId]))
          .digest("hex")}`,
        accountId: actor.accountId,
        action,
        createdAt: this.dependencies.clock.now(),
        requestId,
        result,
      });
      return result;
    });
  }

  private async audit(
    tx: Transaction,
    actor: ActorContext,
    requestId: string,
    resourceId: string,
    action: string,
  ): Promise<void> {
    await tx.appendAudit({
      id: this.dependencies.ids.next("audit"),
      action,
      actorAccountId: actor.accountId,
      createdAt: this.dependencies.clock.now(),
      metadata: {},
      requestId,
      resourceId,
      resourceType: "TEACHER_ACTIVATION_CODE",
      tenantScope: { kind: "PLATFORM" },
    });
  }
}

function requireMode(actor: ActorContext, mode: "PLATFORM" | "ACCOUNT"): void {
  if (actor.mode !== mode) throw new DomainError("FORBIDDEN", "当前身份无权执行教师激活操作");
}

function requireText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw new DomainError("INVALID_INPUT", `${label}无效`);
  }
}

function requirePepper(): string {
  const pepper = process.env.TEACHER_ACTIVATION_PEPPER;
  if (pepper === undefined || pepper.trim().length === 0) {
    throw new DomainError("INTERNAL_ERROR", "教师激活服务尚未配置");
  }
  return pepper;
}

function deriveCode(id: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`teacher-activation-code:${id}`).digest("hex");
}

function hashCode(code: string, pepper: string): string {
  return createHash("sha256")
    .update(JSON.stringify(["teacher-activation-hash", pepper, code]))
    .digest("hex");
}
