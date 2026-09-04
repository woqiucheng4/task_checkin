import type { ChildTree, TreeCatalog } from "./model.js";
import { assertPositiveSunlight } from "./rewards.js";
import { DomainError } from "../shared/errors.js";

const DEFAULT_STAGES = [
  { minimumRatio: 0, name: "种子" },
  { minimumRatio: 0.08, name: "破土" },
  { minimumRatio: 0.16, name: "嫩芽" },
  { minimumRatio: 0.25, name: "树干" },
  { minimumRatio: 0.34, name: "长叶" },
  { minimumRatio: 0.42, name: "花苞" },
  { minimumRatio: 0.5, name: "开花" },
  { minimumRatio: 0.65, name: "小果" },
  { minimumRatio: 0.82, name: "果实变大" },
  { minimumRatio: 1, name: "成熟采摘" },
] as const;

const CATALOG_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export const DEFAULT_TREE_CATALOGS: readonly TreeCatalog[] = [
  {
    id: "starter-apple",
    createdAt: CATALOG_TIMESTAMP,
    fruitName: "苹果",
    name: "新手苹果树",
    rarity: "STARTER",
    stages: DEFAULT_STAGES,
    status: "ACTIVE",
    threshold: 6,
    updatedAt: CATALOG_TIMESTAMP,
  },
  {
    id: "ordinary-pear",
    createdAt: CATALOG_TIMESTAMP,
    fruitName: "梨",
    name: "青梨树",
    rarity: "ORDINARY",
    stages: DEFAULT_STAGES,
    status: "ACTIVE",
    threshold: 24,
    updatedAt: CATALOG_TIMESTAMP,
  },
  {
    id: "rare-orange",
    createdAt: CATALOG_TIMESTAMP,
    fruitName: "橙子",
    name: "星光橙树",
    rarity: "RARE",
    stages: DEFAULT_STAGES,
    status: "ACTIVE",
    threshold: 60,
    updatedAt: CATALOG_TIMESTAMP,
  },
] as const;

export interface TreeVisualEvent {
  readonly kind: "TREE_PROGRESS" | "TREE_MATURED";
  readonly fromStage: string;
  readonly toStage: string;
  readonly sunlightApplied: number;
}

export interface AppliedSunlight {
  readonly tree: ChildTree;
  readonly visualEvent: TreeVisualEvent;
}

export function growthStageFor(catalog: TreeCatalog, progress: number): string {
  if (catalog.threshold <= 0 || progress < 0) {
    throw new DomainError("INVALID_INPUT", "果树阈值或进度无效");
  }
  const ratio = Math.min(progress / catalog.threshold, 1);
  const stages = [...catalog.stages].sort((left, right) => left.minimumRatio - right.minimumRatio);
  let current = stages[0]?.name;
  for (const stage of stages) {
    if (ratio >= stage.minimumRatio) {
      current = stage.name;
    }
  }
  if (current === undefined) {
    throw new DomainError("INVALID_INPUT", "果树目录缺少成长阶段");
  }
  return current;
}

export function applySunlight(
  tree: ChildTree,
  catalog: TreeCatalog,
  amount: number,
  now: string,
): AppliedSunlight {
  assertPositiveSunlight(amount);
  if (tree.status !== "GROWING") {
    throw new DomainError("CONFLICT", "只有成长中的果树可以直接增加进度");
  }
  if (tree.catalogId !== catalog.id) {
    throw new DomainError("CONFLICT", "果树与目录不匹配");
  }
  const remaining = Math.max(catalog.threshold - tree.progress, 0);
  const sunlightApplied = Math.min(amount, remaining);
  const progress = tree.progress + sunlightApplied;
  const carryOver = tree.carryOver + (amount - sunlightApplied);
  const stage = growthStageFor(catalog, progress);
  const matured = progress >= catalog.threshold;
  const next: ChildTree = {
    ...tree,
    carryOver,
    ...(matured ? { maturedAt: now } : {}),
    progress,
    stage,
    status: matured ? "MATURE" : "GROWING",
    updatedAt: now,
  };
  return {
    tree: next,
    visualEvent: {
      fromStage: tree.stage,
      kind: matured ? "TREE_MATURED" : "TREE_PROGRESS",
      sunlightApplied,
      toStage: stage,
    },
  };
}
