import type { GroupTree, TreeCatalog } from "./model.js";
import { DomainError } from "../shared/errors.js";
import { growthStageFor } from "./orchard.js";

export function applyGroupContribution(
  tree: GroupTree,
  catalog: TreeCatalog,
  amount: number,
  now: string,
): GroupTree {
  if (tree.status !== "GROWING") {
    throw new DomainError("CONFLICT", "只有成长中的分组果树可以增加贡献");
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new DomainError("INVALID_INPUT", "分组贡献必须是正整数");
  }
  const progress = Math.min(tree.progress + amount, tree.threshold);
  const stageCatalog: TreeCatalog = { ...catalog, threshold: tree.threshold };
  const matured = progress >= tree.threshold;
  return {
    ...tree,
    ...(matured ? { maturedAt: now } : {}),
    progress,
    stage: growthStageFor(stageCatalog, progress),
    status: matured ? "MATURE" : "GROWING",
    updatedAt: now,
  };
}

export function defaultGroupTreeThreshold(catalog: TreeCatalog): number {
  if (catalog.rarity === "STARTER") {
    return 10;
  }
  if (catalog.rarity === "RARE") {
    return 40;
  }
  return 20;
}
