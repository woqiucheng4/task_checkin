import { describe, expect, it } from "vitest";

import type { Family, SunlightLedger } from "../../src/domain/model.js";
import { COLLECTIONS } from "../../src/infrastructure/collections.js";
import { InMemoryRepository } from "../../src/infrastructure/in-memory-repository.js";

const family: Family = {
  id: "family-1",
  name: "晨光家",
  status: "ACTIVE",
  defaultRewards: {
    challenge: 1,
    focus: 3,
    ordinary: 2,
    revision: 1,
  },
  autoRewardInstitutionTasks: false,
  endOfDayHour: 21,
  createdAt: "2026-09-05T10:00:00.000Z",
  updatedAt: "2026-09-05T10:00:00.000Z",
};

const ledger: SunlightLedger = {
  id: "sunlight-1",
  childId: "child-1",
  amount: 2,
  reason: "TASK_COMPLETED",
  referenceId: "assignment-1",
  actorAccountId: "account-1",
  requestId: "request-ledger-1",
  createdAt: "2026-09-05T10:00:00.000Z",
};

describe("in-memory transactional repository", () => {
  it("rolls back every write when a transaction fails", async () => {
    const repo = new InMemoryRepository();

    await expect(
      repo.transaction(async (tx) => {
        await tx.insert("families", family);
        throw new Error("forced failure");
      }),
    ).rejects.toThrow("forced failure");

    expect(await repo.read("families", family.id)).toBeUndefined();
  });

  it("rejects insertion of a duplicate immutable ledger id", async () => {
    const repo = new InMemoryRepository({ sunlightLedgers: [ledger] });

    await expect(
      repo.transaction((tx) => tx.insert("sunlightLedgers", ledger)),
    ).rejects.toMatchObject({
      code: "ALREADY_EXISTS",
    });
  });

  it("rejects updates to append-only records", async () => {
    const repo = new InMemoryRepository({ sunlightLedgers: [ledger] });

    await expect(
      repo.transaction((tx) => tx.update("sunlightLedgers", ledger.id, { amount: 3 })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("commits writes atomically and queries by record fields", async () => {
    const repo = new InMemoryRepository();

    await repo.transaction(async (tx) => {
      await tx.insert("families", family);
    });

    expect(await repo.query("families", { status: "ACTIVE" })).toEqual([family]);
  });
});

describe("collection manifest", () => {
  it("contains every approved and workflow-required collection", () => {
    expect(Object.keys(COLLECTIONS).sort()).toEqual(
      [
        "accounts",
        "auditLogs",
        "childGroupMemberships",
        "childTrees",
        "children",
        "commandReceipts",
        "consentRecords",
        "contentProviders",
        "exportRequests",
        "families",
        "familyMembers",
        "fruitCollections",
        "fruitWishLinks",
        "groupContributions",
        "groupMemorials",
        "groupRoleBindings",
        "groupTrees",
        "groups",
        "growthCards",
        "guardianLinks",
        "invitations",
        "joinRequests",
        "mediaAssets",
        "organizationMembers",
        "organizations",
        "plans",
        "publicPoolEvents",
        "reviewRecords",
        "rosterSeats",
        "submissions",
        "sunlightLedgers",
        "supportAccessGrants",
        "taskAssignments",
        "taskDrafts",
        "taskTemplates",
        "tasks",
        "tenantEntitlements",
        "treeCatalog",
        "usageCounters",
        "wishes",
      ].sort(),
    );
  });
});
