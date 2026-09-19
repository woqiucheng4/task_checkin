import { describe, expect, it } from "vitest";
import type { AuditLog } from "../../src/domain/model.js";
import {
  CloudBaseRepository,
  COLLECTIONS,
  type CloudDatabase,
} from "../../src/infrastructure/cloudbase-repository.js";

describe("CloudBase repository adapter", () => {
  it("uses one database transaction for a transactional repository callback", async () => {
    const database = new FakeCloudDatabase();
    const repository = new CloudBaseRepository(database);

    await repository.transaction(async (transaction) =>
      transaction.insert("auditLogs", auditFixture),
    );

    expect(database.runTransactionCalls).toBe(1);
    await expect(repository.read("auditLogs", auditFixture.id)).resolves.toEqual(auditFixture);
  });

  it("maps logical collection names to stable snake-case names", () => {
    expect(COLLECTIONS.sunlightLedgers).toBe("task_checkin_sunlight_ledgers");
    expect(COLLECTIONS.childGroupMemberships).toBe("task_checkin_child_group_memberships");
    expect(COLLECTIONS.teacherActivationCodes).toBe("task_checkin_teacher_activation_codes");
    expect(Object.keys(COLLECTIONS)).toHaveLength(43);
  });

  it("supports equality and in-process predicate queries", async () => {
    const repository = new CloudBaseRepository(new FakeCloudDatabase());
    await repository.transaction(async (transaction) => {
      await transaction.insert("auditLogs", auditFixture);
      await transaction.insert("auditLogs", {
        ...auditFixture,
        id: "audit-2",
        action: "SECOND",
        requestId: "request-audit-002",
      });
    });

    await expect(repository.query("auditLogs", { action: "SECOND" })).resolves.toHaveLength(1);
    await expect(
      repository.query("auditLogs", (record) => record.requestId.endsWith("001")),
    ).resolves.toEqual([auditFixture]);
  });

  it("queries when the cloud runtime does not provide structuredClone", async () => {
    const originalStructuredClone = globalThis.structuredClone;
    Object.defineProperty(globalThis, "structuredClone", {
      configurable: true,
      value: undefined,
    });
    try {
      const database = new FakeCloudDatabase();
      database.records.set(
        COLLECTIONS.auditLogs,
        new Map([[auditFixture.id, { ...auditFixture, _id: auditFixture.id }]]),
      );
      const repository = new CloudBaseRepository(database);

      await expect(repository.query("auditLogs", { action: "TESTED" })).resolves.toEqual([
        auditFixture,
      ]);
    } finally {
      Object.defineProperty(globalThis, "structuredClone", {
        configurable: true,
        value: originalStructuredClone,
      });
    }
  });

  it("paginates beyond the CloudBase default query window", async () => {
    const repository = new CloudBaseRepository(new FakeCloudDatabase());
    await repository.transaction(async (transaction) => {
      for (let index = 0; index < 125; index += 1) {
        await transaction.insert("auditLogs", {
          ...auditFixture,
          id: `audit-page-${index}`,
          requestId: `request-page-${index}`,
        });
      }
    });

    await expect(repository.query("auditLogs")).resolves.toHaveLength(125);
  });

  it("enforces append-only records in the production adapter", async () => {
    const repository = new CloudBaseRepository(new FakeCloudDatabase());
    await repository.transaction((transaction) => transaction.insert("auditLogs", auditFixture));

    await expect(
      repository.transaction((transaction) =>
        transaction.update("auditLogs", auditFixture.id, { action: "TAMPERED" }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      repository.transaction((transaction) => transaction.remove("auditLogs", auditFixture.id)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

const auditFixture: AuditLog = {
  id: "audit-1",
  action: "TESTED",
  actorAccountId: "account-1",
  createdAt: "2026-09-05T10:00:00.000Z",
  metadata: {},
  requestId: "request-audit-001",
  resourceId: "resource-1",
  resourceType: "TEST",
  tenantScope: { kind: "PLATFORM" },
};

class FakeCloudDatabase implements CloudDatabase {
  readonly records = new Map<string, Map<string, Record<string, unknown>>>();
  runTransactionCalls = 0;

  collection(name: string) {
    return new FakeCollection(this.records, name);
  }

  async runTransaction<T>(work: (transaction: CloudDatabase) => Promise<T>): Promise<T> {
    this.runTransactionCalls += 1;
    const snapshot = structuredClone(this.records);
    const transaction = new FakeCloudDatabase();
    for (const [collection, records] of snapshot) {
      transaction.records.set(collection, records);
    }
    const result = await work(transaction);
    this.records.clear();
    for (const [collection, records] of transaction.records) {
      this.records.set(collection, records);
    }
    return result;
  }
}

class FakeCollection {
  constructor(
    private readonly database: Map<string, Map<string, Record<string, unknown>>>,
    private readonly name: string,
    private readonly equality?: Readonly<Record<string, unknown>>,
    private readonly offset = 0,
    private readonly pageSize = 100,
  ) {}

  doc(id: string) {
    const records = this.ensureCollection();
    return {
      get: async () => ({ data: structuredClone(records.get(id)) }),
      remove: async () => {
        records.delete(id);
        return {};
      },
      set: async ({ data }: { data: Record<string, unknown> }) => {
        records.set(id, { ...structuredClone(data), _id: id });
        return {};
      },
    };
  }

  async add({ data }: { data: Readonly<Record<string, unknown>> }) {
    const records = this.ensureCollection();
    const id = String(data._id);
    if (records.has(id)) {
      throw Object.assign(new Error("duplicate key"), { code: "DATABASE_DUPLICATE_KEY" });
    }
    records.set(id, structuredClone(data));
    return { _id: id };
  }

  where(equality: Readonly<Record<string, unknown>>) {
    return new FakeCollection(this.database, this.name, equality, this.offset, this.pageSize);
  }

  skip(offset: number) {
    return new FakeCollection(this.database, this.name, this.equality, offset, this.pageSize);
  }

  limit(pageSize: number) {
    return new FakeCollection(this.database, this.name, this.equality, this.offset, pageSize);
  }

  async get() {
    const records = [...this.ensureCollection().values()]
      .filter((record) =>
        Object.entries(this.equality ?? {}).every(([key, value]) => Object.is(record[key], value)),
      )
      .slice(this.offset, this.offset + this.pageSize);
    return { data: structuredClone(records) };
  }

  private ensureCollection(): Map<string, Record<string, unknown>> {
    let records = this.database.get(this.name);
    if (records === undefined) {
      records = new Map();
      this.database.set(this.name, records);
    }
    return records;
  }
}
