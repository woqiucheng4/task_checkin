import type { CollectionName, DomainSchema } from "../domain/model.js";
import type { QueryPredicate, RecordPatch, Repository, Transaction } from "../application/ports.js";
import { DomainError } from "../shared/errors.js";

type DatabaseState = { [K in CollectionName]: Map<string, DomainSchema[K]> };
export type SeedState = { [K in CollectionName]?: readonly DomainSchema[K][] };

const APPEND_ONLY_COLLECTIONS = new Set<CollectionName>([
  "auditLogs",
  "commandReceipts",
  "consentRecords",
  "fruitWishLinks",
  "groupContributions",
  "growthCards",
  "publicPoolEvents",
  "reviewRecords",
  "submissions",
  "sunlightLedgers",
]);

export class InMemoryRepository implements Repository {
  private state: DatabaseState;

  constructor(seed: SeedState = {}) {
    this.state = emptyState();
    for (const collection of Object.keys(seed) as CollectionName[]) {
      const records = seed[collection] ?? [];
      const target = this.state[collection] as Map<string, DomainSchema[typeof collection]>;
      for (const record of records) {
        target.set(record.id, structuredClone(record));
      }
    }
  }

  async read<K extends CollectionName>(
    collection: K,
    id: string,
  ): Promise<DomainSchema[K] | undefined> {
    const record = this.state[collection].get(id);
    return record === undefined ? undefined : structuredClone(record);
  }

  async query<K extends CollectionName>(
    collection: K,
    predicate?: QueryPredicate<DomainSchema[K]>,
  ): Promise<DomainSchema[K][]> {
    return queryMap(this.state[collection], predicate);
  }

  async transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    const candidate = cloneState(this.state);
    const transaction = new InMemoryTransaction(candidate);
    const result = await work(transaction);
    this.state = candidate;
    return structuredClone(result);
  }
}

class InMemoryTransaction implements Transaction {
  constructor(private readonly state: DatabaseState) {}

  async read<K extends CollectionName>(
    collection: K,
    id: string,
  ): Promise<DomainSchema[K] | undefined> {
    const record = this.state[collection].get(id);
    return record === undefined ? undefined : structuredClone(record);
  }

  async query<K extends CollectionName>(
    collection: K,
    predicate?: QueryPredicate<DomainSchema[K]>,
  ): Promise<DomainSchema[K][]> {
    return queryMap(this.state[collection], predicate);
  }

  async insert<K extends CollectionName>(
    collection: K,
    record: DomainSchema[K],
  ): Promise<DomainSchema[K]> {
    const records = this.state[collection];
    if (records.has(record.id)) {
      throw new DomainError("ALREADY_EXISTS", `${collection} 中已存在记录 ${record.id}`);
    }
    records.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async update<K extends CollectionName>(
    collection: K,
    id: string,
    patch: RecordPatch<DomainSchema[K]> | ((record: DomainSchema[K]) => DomainSchema[K]),
  ): Promise<DomainSchema[K]> {
    if (APPEND_ONLY_COLLECTIONS.has(collection)) {
      throw new DomainError("FORBIDDEN", `${collection} 是不可变集合`);
    }

    const current = this.state[collection].get(id);
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
    this.state[collection].set(id, structuredClone(next));
    return structuredClone(next);
  }

  async remove<K extends CollectionName>(collection: K, id: string): Promise<void> {
    if (APPEND_ONLY_COLLECTIONS.has(collection)) {
      throw new DomainError("FORBIDDEN", `${collection} 是不可变集合`);
    }
    if (!this.state[collection].delete(id)) {
      throw new DomainError("NOT_FOUND", `${collection} 中不存在记录 ${id}`);
    }
  }

  async appendAudit(record: DomainSchema["auditLogs"]): Promise<DomainSchema["auditLogs"]> {
    return this.insert("auditLogs", record);
  }
}

function queryMap<K extends CollectionName>(
  records: Map<string, DomainSchema[K]>,
  predicate?: QueryPredicate<DomainSchema[K]>,
): DomainSchema[K][] {
  const matches = [...records.values()].filter((record) => matchesPredicate(record, predicate));
  return structuredClone(matches);
}

function matchesPredicate<T>(record: T, predicate?: QueryPredicate<T>): boolean {
  if (predicate === undefined) {
    return true;
  }
  if (typeof predicate === "function") {
    return predicate(record);
  }
  return Object.entries(predicate).every(([key, expected]) =>
    Object.is((record as Record<string, unknown>)[key], expected),
  );
}

function cloneState(state: DatabaseState): DatabaseState {
  const copy = emptyState();
  for (const collection of Object.keys(state) as CollectionName[]) {
    const source = state[collection];
    const target = copy[collection] as Map<string, DomainSchema[typeof collection]>;
    for (const [id, record] of source) {
      target.set(id, structuredClone(record));
    }
  }
  return copy;
}

function emptyState(): DatabaseState {
  return {
    accounts: new Map(),
    auditLogs: new Map(),
    childGroupMemberships: new Map(),
    childTrees: new Map(),
    children: new Map(),
    commandReceipts: new Map(),
    consentRecords: new Map(),
    contentProviders: new Map(),
    exportRequests: new Map(),
    families: new Map(),
    familyMembers: new Map(),
    fruitCollections: new Map(),
    fruitWishLinks: new Map(),
    groupContributions: new Map(),
    groupMemorials: new Map(),
    groupRoleBindings: new Map(),
    groupTrees: new Map(),
    groups: new Map(),
    growthCards: new Map(),
    guardianLinks: new Map(),
    invitations: new Map(),
    joinRequests: new Map(),
    mediaAssets: new Map(),
    organizationMembers: new Map(),
    organizations: new Map(),
    plans: new Map(),
    publicPoolEvents: new Map(),
    reviewRecords: new Map(),
    rosterSeats: new Map(),
    submissions: new Map(),
    sunlightLedgers: new Map(),
    supportAccessGrants: new Map(),
    taskAssignments: new Map(),
    taskDrafts: new Map(),
    taskTemplates: new Map(),
    tasks: new Map(),
    tenantEntitlements: new Map(),
    treeCatalog: new Map(),
    usageCounters: new Map(),
    wishes: new Map(),
  };
}
