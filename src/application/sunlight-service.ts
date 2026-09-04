import type { ApplicationDependencies, Transaction } from "./ports.js";
import type { ActorContext, SunlightLedger, TenantScope } from "../domain/model.js";
import { assertPositiveSunlight } from "../domain/rewards.js";
import { DomainError } from "../shared/errors.js";
import { OrchardService } from "./orchard-service.js";

export interface SunlightGrantInput {
  readonly assignmentId: string;
  readonly amount: number;
  readonly reason: SunlightLedger["reason"];
  readonly requestId: string;
  readonly referenceId?: string;
}

export class SunlightService {
  constructor(private readonly dependencies: ApplicationDependencies) {}

  async grantForAssignment(
    actor: ActorContext,
    input: SunlightGrantInput,
  ): Promise<SunlightLedger> {
    if (actor.mode !== "PLATFORM") {
      throw new DomainError("FORBIDDEN", "直接发放阳光只允许受信任的系统流程");
    }
    assertPositiveSunlight(input.amount);
    requireRequestId(input.requestId);
    const assignment = await this.dependencies.repository.read(
      "taskAssignments",
      input.assignmentId,
    );
    if (assignment === undefined) {
      throw new DomainError("NOT_FOUND", "任务实例不存在");
    }
    const task = await this.dependencies.repository.read("tasks", assignment.taskId);
    if (task === undefined) {
      throw new DomainError("NOT_FOUND", "任务不存在");
    }
    return this.dependencies.repository.transaction(async (tx) => {
      const ledger = await this.grantInTransaction(tx, actor.accountId, assignment.childId, input);
      await tx.appendAudit({
        id: this.dependencies.ids.next("audit"),
        action: "SUNLIGHT_GRANTED",
        actorAccountId: actor.accountId,
        createdAt: this.dependencies.clock.now(),
        metadata: { amount: ledger.amount, reason: ledger.reason },
        requestId: input.requestId,
        resourceId: ledger.id,
        resourceType: "SUNLIGHT_LEDGER",
        tenantScope: task.sourceScope,
      });
      return ledger;
    });
  }

  async grantInTransaction(
    tx: Transaction,
    actorAccountId: string,
    childId: string,
    input: SunlightGrantInput,
  ): Promise<SunlightLedger> {
    assertPositiveSunlight(input.amount);
    requireRequestId(input.requestId);
    const referenceId = input.referenceId ?? input.assignmentId;
    const existing = (
      await tx.query("sunlightLedgers", {
        reason: input.reason,
        referenceId,
      })
    )[0];
    if (existing !== undefined) {
      if (existing.childId !== childId || existing.amount !== input.amount) {
        throw new DomainError("CONFLICT", "阳光发放引用已存在但内容不一致");
      }
      return existing;
    }
    const ledger: SunlightLedger = {
      id: this.dependencies.ids.next("sunlight"),
      actorAccountId,
      amount: input.amount,
      childId,
      createdAt: this.dependencies.clock.now(),
      reason: input.reason,
      referenceId,
      requestId: input.requestId,
    };
    const inserted = await tx.insert("sunlightLedgers", ledger);
    await new OrchardService(this.dependencies).applySunlightInTransaction(
      tx,
      childId,
      input.amount,
    );
    return inserted;
  }

  async ledgerForChild(childId: string): Promise<SunlightLedger[]> {
    const ledgers = await this.dependencies.repository.query("sunlightLedgers", { childId });
    return ledgers.sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
  }

  async balanceForChild(childId: string): Promise<number> {
    return (await this.ledgerForChild(childId)).reduce((total, ledger) => total + ledger.amount, 0);
  }
}

export function sunlightScopeForAssignment(input: {
  readonly familyId: string;
  readonly organizationId?: string;
}): TenantScope {
  return input.organizationId === undefined
    ? { kind: "FAMILY", familyId: input.familyId }
    : { kind: "ORGANIZATION", organizationId: input.organizationId };
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
