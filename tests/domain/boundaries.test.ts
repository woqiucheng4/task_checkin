import { describe, expect, it } from "vitest";
import { sameTenantScope } from "../../src/domain/entitlements.js";
import {
  applyGroupContribution,
  defaultGroupTreeThreshold,
} from "../../src/domain/group-orchard.js";
import { addDays, assertValidMediaInput } from "../../src/domain/media.js";
import type {
  ChildTree,
  Family,
  GroupTree,
  Task,
  TaskAssignment,
  TreeCatalog,
} from "../../src/domain/model.js";
import { applySunlight, DEFAULT_TREE_CATALOGS, growthStageFor } from "../../src/domain/orchard.js";
import { assertPositiveSunlight, taskRewardAmount } from "../../src/domain/rewards.js";
import {
  assignmentBusinessKey,
  assertValidSchedule,
  isScheduledOn,
} from "../../src/domain/tasks.js";
import { activeFruitReservation } from "../../src/domain/wishes.js";

const starter = DEFAULT_TREE_CATALOGS[0] as TreeCatalog;

describe("domain boundary branches", () => {
  it("compares every tenant-scope variant", () => {
    expect(
      sameTenantScope({ kind: "FAMILY", familyId: "a" }, { kind: "FAMILY", familyId: "a" }),
    ).toBe(true);
    expect(
      sameTenantScope({ kind: "FAMILY", familyId: "a" }, { kind: "FAMILY", familyId: "b" }),
    ).toBe(false);
    expect(sameTenantScope({ kind: "FAMILY", familyId: "a" }, { kind: "PLATFORM" })).toBe(false);
    expect(
      sameTenantScope(
        { kind: "ORGANIZATION", organizationId: "a" },
        { kind: "ORGANIZATION", organizationId: "a" },
      ),
    ).toBe(true);
    expect(
      sameTenantScope(
        { kind: "ORGANIZATION", organizationId: "a" },
        { kind: "ORGANIZATION", organizationId: "b" },
      ),
    ).toBe(false);
    expect(
      sameTenantScope(
        { kind: "CONTENT_PROVIDER", contentProviderId: "a" },
        { kind: "CONTENT_PROVIDER", contentProviderId: "a" },
      ),
    ).toBe(true);
    expect(
      sameTenantScope(
        { kind: "CONTENT_PROVIDER", contentProviderId: "a" },
        { kind: "CONTENT_PROVIDER", contentProviderId: "b" },
      ),
    ).toBe(false);
    expect(sameTenantScope({ kind: "PLATFORM" }, { kind: "PLATFORM" })).toBe(true);
  });

  it("validates group contributions and every rarity threshold", () => {
    const tree = groupTree({ progress: 9, threshold: 10 });
    expect(applyGroupContribution(tree, starter, 2, "2026-09-05T10:00:00.000Z")).toMatchObject({
      maturedAt: "2026-09-05T10:00:00.000Z",
      progress: 10,
      status: "MATURE",
    });
    expect(
      applyGroupContribution(groupTree({ progress: 1 }), starter, 1, "2026-09-05T10:00:00.000Z"),
    ).toMatchObject({ progress: 2, status: "GROWING" });
    expect(() =>
      applyGroupContribution(groupTree({ status: "MATURE" }), starter, 1, "now"),
    ).toThrow(/成长中/);
    expect(() => applyGroupContribution(groupTree(), starter, 0, "now")).toThrow(/正整数/);
    expect(defaultGroupTreeThreshold(starter)).toBe(10);
    expect(defaultGroupTreeThreshold({ ...starter, rarity: "ORDINARY" })).toBe(20);
    expect(defaultGroupTreeThreshold({ ...starter, rarity: "RARE" })).toBe(40);
  });

  it("rejects every invalid media boundary and adds UTC days", () => {
    expect(() =>
      assertValidMediaInput({ byteSize: 1, mimeType: "text/plain", retentionDays: 1 }),
    ).toThrow(/JPEG/);
    expect(() =>
      assertValidMediaInput({ byteSize: 0, mimeType: "image/png", retentionDays: 1 }),
    ).toThrow(/图片大小/);
    expect(() =>
      assertValidMediaInput({ byteSize: 1.5, mimeType: "image/png", retentionDays: 1 }),
    ).toThrow(/图片大小/);
    expect(() =>
      assertValidMediaInput({ byteSize: 10_000_001, mimeType: "image/png", retentionDays: 1 }),
    ).toThrow(/图片大小/);
    expect(() =>
      assertValidMediaInput({ byteSize: 1, mimeType: "image/png", retentionDays: 0 }),
    ).toThrow(/保存期限/);
    expect(() =>
      assertValidMediaInput({ byteSize: 1, mimeType: "image/png", retentionDays: 1.5 }),
    ).toThrow(/保存期限/);
    expect(() =>
      assertValidMediaInput({ byteSize: 1, mimeType: "image/png", retentionDays: 366 }),
    ).toThrow(/保存期限/);
    expect(() =>
      assertValidMediaInput({ byteSize: 1, mimeType: "image/webp", retentionDays: 365 }),
    ).not.toThrow();
    expect(addDays("2026-09-05T10:00:00.000Z", 2)).toBe("2026-09-07T10:00:00.000Z");
  });

  it("guards orchard catalog and tree invariants", () => {
    expect(() => growthStageFor({ ...starter, threshold: 0 }, 0)).toThrow(/阈值/);
    expect(() => growthStageFor(starter, -1)).toThrow(/阈值/);
    expect(() => growthStageFor({ ...starter, stages: [] }, 0)).toThrow(/缺少成长阶段/);
    expect(() => applySunlight(childTree({ status: "MATURE" }), starter, 1, "now")).toThrow(
      /成长中/,
    );
    expect(() => applySunlight(childTree({ catalogId: "other" }), starter, 1, "now")).toThrow(
      /不匹配/,
    );
    expect(applySunlight(childTree({ progress: 1 }), starter, 1, "now")).toMatchObject({
      tree: { progress: 2, status: "GROWING" },
      visualEvent: { kind: "TREE_PROGRESS", sunlightApplied: 1 },
    });
  });

  it("selects challenge, focus, and ordinary rewards and rejects non-positive sunlight", () => {
    const family = rewardFamily();
    expect(taskRewardAmount(family, rewardTask("CHALLENGE"), rewardAssignment())).toBe(4);
    expect(taskRewardAmount(family, rewardTask("FOCUS"), rewardAssignment())).toBe(3);
    expect(
      taskRewardAmount(family, rewardTask("REQUIRED"), rewardAssignment({ familyFocusRank: 1 })),
    ).toBe(3);
    expect(taskRewardAmount(family, rewardTask("REQUIRED"), rewardAssignment())).toBe(2);
    for (const amount of [0, -1, 1.5, 101]) {
      expect(() => assertPositiveSunlight(amount)).toThrow(/阳光数量/);
    }
    expect(() => assertPositiveSunlight(100)).not.toThrow();
  });

  it("covers once, daily, weekly, bounded, and invalid schedules", () => {
    expect(isScheduledOn({ date: "2026-09-05", kind: "ONCE" }, "2026-09-05")).toBe(true);
    expect(isScheduledOn({ date: "2026-09-05", kind: "ONCE" }, "2026-09-06")).toBe(false);
    expect(isScheduledOn({ kind: "DAILY", startDate: "2026-09-05" }, "2026-09-06")).toBe(true);
    expect(
      isScheduledOn(
        { endDate: "2026-09-06", kind: "DAILY", startDate: "2026-09-05" },
        "2026-09-07",
      ),
    ).toBe(false);
    expect(
      isScheduledOn({ kind: "WEEKLY", startDate: "2026-09-01", weekdays: [7] }, "2026-09-06"),
    ).toBe(true);
    expect(
      isScheduledOn({ kind: "WEEKLY", startDate: "2026-09-01", weekdays: [1] }, "2026-09-06"),
    ).toBe(false);
    expect(() =>
      assertValidSchedule({ endDate: "2026-09-01", kind: "DAILY", startDate: "2026-09-02" }),
    ).toThrow(/结束日期/);
    for (const weekdays of [[], [1, 1], [0], [8], [1.5]]) {
      expect(() =>
        assertValidSchedule({ kind: "WEEKLY", startDate: "2026-09-01", weekdays }),
      ).toThrow(/星期配置/);
    }
    expect(() => assertValidSchedule({ date: "2026-02-30", kind: "ONCE" })).toThrow(/日历日期/);
    expect(() => isScheduledOn({ date: "2026-09-05", kind: "ONCE" }, "bad")).toThrow(/YYYY-MM-DD/);
    expect(() => assignmentBusinessKey("", "child", "2026-09-05")).toThrow(/不能为空/);
    expect(assignmentBusinessKey("task", "child", "2026-09-05")).toBe("task:child:2026-09-05");
  });

  it("subtracts released and consumed wish reservations", () => {
    const base = {
      childId: "c",
      createdAt: "now",
      familyId: "f",
      fruitCollectionId: "fruit",
      quantity: 2,
      requestId: "r",
      wishId: "wish",
    } as const;
    expect(
      activeFruitReservation(
        [
          { ...base, id: "1", action: "RESERVED" },
          { ...base, id: "2", action: "RELEASED", quantity: 1 },
          { ...base, id: "3", action: "CONSUMED", quantity: 1 },
          { ...base, id: "4", action: "RESERVED", wishId: "other" },
        ],
        "wish",
        "fruit",
      ),
    ).toBe(0);
  });
});

function groupTree(overrides: Partial<GroupTree> = {}): GroupTree {
  return {
    id: "group-tree",
    catalogId: starter.id,
    createdAt: "now",
    groupId: "g",
    organizationId: "o",
    progress: 0,
    stage: "种子",
    status: "GROWING",
    threshold: 10,
    updatedAt: "now",
    ...overrides,
  };
}

function childTree(overrides: Partial<ChildTree> = {}): ChildTree {
  return {
    id: "tree",
    carryOver: 0,
    catalogId: starter.id,
    childId: "c",
    createdAt: "now",
    progress: 0,
    stage: "种子",
    status: "GROWING",
    updatedAt: "now",
    ...overrides,
  };
}

function rewardFamily(): Family {
  return {
    id: "f",
    autoRewardInstitutionTasks: false,
    createdAt: "now",
    defaultRewards: { challenge: 4, focus: 3, ordinary: 2, revision: 1 },
    endOfDayHour: 21,
    name: "家",
    status: "ACTIVE",
    updatedAt: "now",
  };
}

function rewardTask(importance: Task["importance"]): Task {
  return {
    id: "t",
    allowLateSubmission: true,
    category: "LIFE",
    createdAt: "now",
    dueAt: "later",
    estimatedMinutes: 1,
    importance,
    publisherAccountId: "a",
    requiresAcademicReview: false,
    schedule: { date: "2026-09-05", kind: "ONCE" },
    source: "FAMILY",
    sourceAssetIds: [],
    sourceScope: { familyId: "f", kind: "FAMILY" },
    startsAt: "now",
    status: "PUBLISHED",
    submissionMode: "CONFIRM",
    title: "任务",
    updatedAt: "now",
  };
}

function rewardAssignment(overrides: Partial<TaskAssignment> = {}): TaskAssignment {
  return {
    id: "a",
    academicState: "NOT_REQUIRED",
    acceptedLateChallenge: false,
    businessKey: "b",
    childId: "c",
    createdAt: "now",
    familyId: "f",
    occurrenceDate: "2026-09-05",
    publicPoolEventCreated: false,
    rewardState: "PROTECTED",
    taskId: "t",
    taskState: "SUBMITTED",
    updatedAt: "now",
    ...overrides,
  };
}
