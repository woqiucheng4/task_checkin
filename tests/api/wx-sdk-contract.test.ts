import { createRequire } from "node:module";
import { expect, it } from "vitest";
import {
  CloudBaseRepository,
  type CloudDatabase,
} from "../../src/infrastructure/cloudbase-repository.js";

// Run against the exact installed cloud-function SDK, replacing only its network transport.
const require = createRequire(
  new URL("../../cloudfunctions/coreApi/package.json", import.meta.url),
);
const cloud = require("wx-server-sdk") as {
  init(options: { env: string }): void;
  database(): CloudDatabase;
};
const { Db } = require("@cloudbase/database") as { Db: { reqClass: unknown } };

it("inserts through the real wx SDK, preserves IDs and rejects duplicate audit records", async () => {
  cloud.init({ env: "contract-test-no-network" });
  const database = cloud.database();
  const original = Db.reqClass;
  const inserted: Record<string, unknown>[] = [];
  const operations: string[] = [];
  Db.reqClass = class {
    async send(
      action: string,
      params?: { collectionName?: string; transactionId?: string; data?: string[] },
    ) {
      operations.push(action);
      if (action === "database.startTransaction") return { transactionId: "tx-contract" };
      if (action === "database.commitTransaction" || action === "database.abortTransaction")
        return {};
      if (action !== "database.insertDocument")
        throw new Error(`Unexpected transport action ${action}`);
      expect(params?.collectionName).toBe("task_checkin_audit_logs");
      expect(params?.transactionId).toBe("tx-contract");
      const data = JSON.parse(params?.data?.[0] || "null") as Record<string, unknown>;
      if (inserted.some((row) => row._id === data._id))
        return { code: "DATABASE_DUPLICATE_KEY", message: "duplicate key" };
      inserted.push(data);
      return { data: { insertedIds: [data._id] }, requestId: "transport-contract" };
    }
  };
  try {
    const repository = new CloudBaseRepository(database);
    const audit = {
      id: "audit-sdk",
      action: "SDK_INSERT",
      actorAccountId: "account-sdk",
      createdAt: "2026-09-07T00:00:00Z",
      metadata: {},
      requestId: "request-sdk",
      resourceId: "resource-sdk",
      resourceType: "TEST",
      tenantScope: { kind: "PLATFORM" as const },
    };
    await expect(repository.transaction((tx) => tx.insert("auditLogs", audit))).resolves.toEqual(
      audit,
    );
    expect(inserted).toEqual([
      {
        _id: "audit-sdk",
        action: "SDK_INSERT",
        actorAccountId: "account-sdk",
        createdAt: "2026-09-07T00:00:00Z",
        metadata: {},
        requestId: "request-sdk",
        resourceId: "resource-sdk",
        resourceType: "TEST",
        tenantScope: { kind: "PLATFORM" },
      },
    ]);
    await expect(
      repository.transaction((tx) => tx.insert("auditLogs", { ...audit, action: "TAMPERED" })),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(inserted).toHaveLength(1);
    expect(operations).toEqual([
      "database.startTransaction",
      "database.insertDocument",
      "database.commitTransaction",
      "database.startTransaction",
      "database.insertDocument",
      "database.abortTransaction",
    ]);
  } finally {
    Db.reqClass = original;
  }
});
