import type { QueryPredicate, RecordPatch, Repository, Transaction } from "../application/ports.js";
import type { AuditLog, CollectionName, DomainSchema } from "../domain/model.js";
import { DomainError } from "../shared/errors.js";

import { COLLECTIONS } from "./collections.js";
export { COLLECTIONS } from "./collections.js";

export const APPEND_ONLY_COLLECTIONS = new Set<CollectionName>([
  "auditLogs",
  "commandReceipts",
  "consentRecords",
  "fruitWishLinks",
  "groupContributions",
  "groupMemorials",
  "growthCards",
  "publicPoolEvents",
  "reviewRecords",
  "submissionEvidenceLinks",
  "submissions",
  "sunlightLedgers",
]);

export interface CloudDocumentReference {
  get(): Promise<{ readonly data?: unknown }>;
  remove(): Promise<unknown>;
  set(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
}

export interface CloudCollectionReference {
  add(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
  doc(id: string): CloudDocumentReference;
  get(): Promise<{ readonly data?: unknown }>;
  limit(count: number): CloudCollectionReference;
  skip(count: number): CloudCollectionReference;
  where(equality: Readonly<Record<string, unknown>>): CloudCollectionReference;
}

export interface CloudDatabase {
  collection(name: string): CloudCollectionReference;
  runTransaction<T>(work: (transaction: CloudDatabase) => Promise<T>): Promise<T>;
}

export class CloudBaseRepository implements Repository {
  constructor(private readonly database: CloudDatabase) {
    ensureStructuredClone();
  }

  async read<K extends CollectionName>(
    collection: K,
    id: string,
  ): Promise<DomainSchema[K] | undefined> {
    return new CloudBaseReadRepository(this.database).read(collection, id);
  }

  async query<K extends CollectionName>(
    collection: K,
    predicate?: QueryPredicate<DomainSchema[K]>,
  ): Promise<DomainSchema[K][]> {
    return new CloudBaseReadRepository(this.database).query(collection, predicate);
  }

  async transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.database.runTransaction((databaseTransaction) =>
        work(new CloudBaseTransaction(databaseTransaction)),
      );
    } catch (error) {
      throw translateCloudError(error);
    }
  }
}

class CloudBaseReadRepository {
  constructor(protected readonly database: CloudDatabase) {}

  async read<K extends CollectionName>(
    collection: K,
    id: string,
  ): Promise<DomainSchema[K] | undefined> {
    try {
      const response = await this.database.collection(COLLECTIONS[collection]).doc(id).get();
      const value = Array.isArray(response.data) ? response.data[0] : response.data;
      return value === undefined || value === null
        ? undefined
        : fromCloudRecord<DomainSchema[K]>(value);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw translateCloudError(error);
    }
  }

  async query<K extends CollectionName>(
    collection: K,
    predicate?: QueryPredicate<DomainSchema[K]>,
  ): Promise<DomainSchema[K][]> {
    try {
      let reference = this.database.collection(COLLECTIONS[collection]);
      if (predicate !== undefined && typeof predicate !== "function") {
        reference = reference.where(toCloudQuery(predicate));
      }
      const values: unknown[] = [];
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const response = await reference.skip(offset).limit(pageSize).get();
        const page = Array.isArray(response.data)
          ? response.data
          : response.data === undefined || response.data === null
            ? []
            : [response.data];
        values.push(...page);
        if (page.length < pageSize) {
          break;
        }
      }
      const records = values.map((value) => fromCloudRecord<DomainSchema[K]>(value));
      return structuredClone(
        typeof predicate === "function" ? records.filter((record) => predicate(record)) : records,
      );
    } catch (error) {
      throw translateCloudError(error);
    }
  }
}

class CloudBaseTransaction extends CloudBaseReadRepository implements Transaction {
  async insert<K extends CollectionName>(
    collection: K,
    record: DomainSchema[K],
  ): Promise<DomainSchema[K]> {
    try {
      await this.database
        .collection(COLLECTIONS[collection])
        .add({ data: { ...toCloudData(record), _id: record.id } });
      return structuredClone(record);
    } catch (error) {
      throw translateCloudError(error);
    }
  }

  async update<K extends CollectionName>(
    collection: K,
    id: string,
    patch: RecordPatch<DomainSchema[K]> | ((record: DomainSchema[K]) => DomainSchema[K]),
  ): Promise<DomainSchema[K]> {
    requireMutableCollection(collection);
    const current = await this.read(collection, id);
    if (current === undefined) {
      throw new DomainError("NOT_FOUND", `${collection} 中不存在记录 ${id}`);
    }
    const next =
      typeof patch === "function"
        ? patch(structuredClone(current))
        : ({ ...structuredClone(current), ...structuredClone(patch) } as DomainSchema[K]);
    if (next.id !== id) {
      throw new DomainError("INVALID_INPUT", "更新不能修改记录 id");
    }
    try {
      await this.database
        .collection(COLLECTIONS[collection])
        .doc(id)
        .set({ data: toCloudData(next) });
      return structuredClone(next);
    } catch (error) {
      throw translateCloudError(error);
    }
  }

  async remove<K extends CollectionName>(collection: K, id: string): Promise<void> {
    requireMutableCollection(collection);
    if ((await this.read(collection, id)) === undefined) {
      throw new DomainError("NOT_FOUND", `${collection} 中不存在记录 ${id}`);
    }
    try {
      await this.database.collection(COLLECTIONS[collection]).doc(id).remove();
    } catch (error) {
      throw translateCloudError(error);
    }
  }

  async appendAudit(record: AuditLog): Promise<AuditLog> {
    return this.insert("auditLogs", record);
  }
}

function requireMutableCollection(collection: CollectionName): void {
  if (APPEND_ONLY_COLLECTIONS.has(collection)) {
    throw new DomainError("FORBIDDEN", `${collection} 是不可变集合`);
  }
}

function toCloudData<T extends { readonly id: string }>(
  record: T,
): Readonly<Record<string, unknown>> {
  const { id: _id, ...data } = structuredClone(record) as T & Record<string, unknown>;
  return data;
}

function toCloudQuery(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const query: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    query[key === "id" ? "_id" : key] = structuredClone(value);
  }
  return query;
}

function fromCloudRecord<T>(value: unknown): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainError("INTERNAL_ERROR", "CloudBase 返回了无效文档");
  }
  const source = value as Readonly<Record<string, unknown>>;
  const id = source._id ?? source.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new DomainError("INTERNAL_ERROR", "CloudBase 文档缺少 _id");
  }
  const { _id: _cloudId, ...record } = structuredClone(source);
  return { ...record, id } as T;
}

function translateCloudError(error: unknown): DomainError {
  if (error instanceof DomainError) {
    return error;
  }
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (/duplicate|already.?exists/i.test(`${code} ${message}`)) {
    return new DomainError("ALREADY_EXISTS", "记录已存在");
  }
  if (/transaction|conflict|write.?conflict/i.test(`${code} ${message}`)) {
    return new DomainError("CONFLICT", "数据库事务冲突，请重试");
  }
  return new DomainError("INTERNAL_ERROR", "数据库操作失败");
}

function isNotFoundError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /not.?found|does not exist|document_get fail/i.test(text);
}

function ensureStructuredClone(): void {
  if (typeof globalThis.structuredClone === "function") return;
  globalThis.structuredClone = function clone<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Date) return new Date(value.getTime()) as T;
    if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  };
}
