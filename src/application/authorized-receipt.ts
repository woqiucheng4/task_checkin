import type { ActorContext, CollectionName, CommandReceipt } from "../domain/model.js";
import type { ApplicationDependencies, Repository, Transaction } from "./ports.js";
import { DomainError } from "../shared/errors.js";
import { commandReceiptId } from "../shared/ids.js";

/** Ordinary writes run in one transaction. Read and mutation dependencies prove
 * that the service's authorization remains valid before replaying its result.
 * Service-owned idempotency is required for external IO and lifecycle retries.
 * Legacy receipts lack this proof and are never used as an authorization source.
 */
export async function authorizedReceipt(
  dependencies: ApplicationDependencies,
  actor: ActorContext,
  action: string,
  requestId: string,
  payload: Readonly<Record<string, unknown>>,
  execute: (repository: Repository) => Promise<unknown>,
): Promise<unknown> {
  return dependencies.repository.transaction(async (tx) => {
    const command = JSON.stringify({ actor, payload });
    const id = commandReceiptId("authorized", actor.accountId, action, requestId);
    const receipt = await tx.read("commandReceipts", id);
    if (receipt?.authorization) {
      if (receipt.authorization.command !== command)
        throw new DomainError("CONFLICT", "requestId 已用于其他身份或请求内容");
      const now = Date.parse(dependencies.clock.now());
      if (!Number.isFinite(now)) throw new DomainError("FORBIDDEN", "无法验证授权有效期");
      for (const guard of receipt.authorization.dependencies) {
        const current = await tx.read(guard.collection, guard.id);
        const hasExpiry = current !== undefined && "expiresAt" in current;
        const expiresAt =
          hasExpiry && typeof current.expiresAt === "string"
            ? Date.parse(current.expiresAt)
            : Number.NaN;
        if (
          JSON.stringify(current ?? null) !== guard.snapshot ||
          (hasExpiry && (!Number.isFinite(expiresAt) || expiresAt <= now))
        )
          throw new DomainError("FORBIDDEN", "原请求的授权或资源状态已变化，请重新发起操作");
      }
      return receipt.result;
    }
    const legacy = (
      await tx.query("commandReceipts", { accountId: actor.accountId, action, requestId })
    )[0];
    const requireFreshWrite = () => {
      // A legacy result cannot prove current authorization. Let the service run
      // its current checks, but never execute the old mutation a second time or
      // insert a duplicate actor/action/request receipt on the cloud unique index.
      if (legacy) throw new DomainError("CONFLICT", "历史请求缺少授权凭证，请使用新的 requestId");
    };
    const guards = new Map<string, { collection: CollectionName; id: string }>();
    const track = (collection: CollectionName, recordId: string) => {
      if (collection !== "commandReceipts")
        guards.set(`${collection}:${recordId}`, { collection, id: recordId });
    };
    const tracked: Transaction = {
      async read(collection, recordId) {
        track(collection, recordId);
        return tx.read(collection, recordId);
      },
      async query(collection, predicate) {
        const records = await tx.query(collection, predicate);
        for (const record of records) track(collection, record.id);
        return records;
      },
      async insert(collection, record) {
        requireFreshWrite();
        track(collection, record.id);
        return tx.insert(collection, record);
      },
      async update(collection, recordId, patch) {
        requireFreshWrite();
        track(collection, recordId);
        return tx.update(collection, recordId, patch);
      },
      async remove(collection, recordId) {
        requireFreshWrite();
        track(collection, recordId);
        return tx.remove(collection, recordId);
      },
      async appendAudit(record) {
        requireFreshWrite();
        return tx.appendAudit(record);
      },
    };
    // Child scope is checked and tracked by each service using payload.childId.
    // Account/provider authority is also required for every write.
    const account = await tracked.read("accounts", actor.accountId);
    if (account?.status !== "ACTIVE") throw new DomainError("UNAUTHORIZED", "账号已停用");
    if (actor.mode === "CONTENT_PROVIDER") {
      const provider = actor.contentProviderId
        ? await tracked.read("contentProviders", actor.contentProviderId)
        : undefined;
      if (provider?.status !== "ACTIVE" || provider.accountId !== actor.accountId)
        throw new DomainError("FORBIDDEN", "内容方授权已失效");
    }
    const result = await execute({
      read: tracked.read,
      query: tracked.query,
      transaction: (work) => work(tracked),
    });
    if (legacy) return result;
    const snapshots: NonNullable<CommandReceipt["authorization"]>["dependencies"][number][] = [];
    for (const guard of guards.values())
      snapshots.push({
        ...guard,
        snapshot: JSON.stringify((await tx.read(guard.collection, guard.id)) ?? null),
      });
    await tx.insert("commandReceipts", {
      id,
      accountId: actor.accountId,
      action,
      requestId,
      result,
      createdAt: dependencies.clock.now(),
      authorization: { command, dependencies: snapshots },
    });
    return result;
  });
}
