export type OrchardAssetTarget = "source" | "miniprogram" | "web";

export interface OrchardAssetDefinition {
  readonly fileName: string;
  readonly alt: string;
  readonly slot: "hero" | "stage" | "scene" | "collection";
}

export const ORCHARD_ASSETS = {
  "apple.seed": asset("apple-seed.png", "苹果种子", "stage"),
  "apple.sprout": asset("apple-sprout.png", "破土的苹果嫩芽", "stage"),
  "apple.seedling": asset("apple-seedling.png", "苹果幼苗", "stage"),
  "apple.trunk": asset("apple-trunk.png", "长出树干的苹果树", "stage"),
  "apple.leaves": asset("apple-leaves.png", "长满绿叶的苹果树", "stage"),
  "apple.bud": asset("apple-bud.png", "结出花苞的苹果树", "stage"),
  "apple.blossom": asset("apple-blossom.png", "开花的苹果树", "stage"),
  "apple.fruitSmall": asset("apple-fruit-small.png", "结出小苹果的果树", "stage"),
  "apple.fruitGrowing": asset("apple-fruit-growing.png", "果实正在长大的苹果树", "stage"),
  "apple.mature": asset("apple-mature.png", "成熟并挂满红苹果的果树", "hero"),
  "pear.mature": asset("pear-mature.png", "成熟的梨树", "collection"),
  "orange.mature": asset("orange-mature.png", "成熟的橙子树", "collection"),
  "scene.watering": asset("scene-watering.png", "水壶给小树浇水", "scene"),
  "scene.groupTree": asset("scene-group-tree.png", "同学们共同培育的果树", "scene"),
  "scene.harvest": asset("scene-harvest.png", "装满成熟水果的采摘篮", "scene"),
  "scene.emptyTasks": asset("scene-empty-tasks.png", "今天的任务已经全部完成", "scene"),
  "scene.offline": asset("scene-offline.png", "小树等待网络恢复", "scene"),
  "scene.invitationExpired": asset("scene-invitation-expired.png", "已经过期的分组邀请", "scene"),
} as const satisfies Record<string, OrchardAssetDefinition>;

export type OrchardAssetKey = keyof typeof ORCHARD_ASSETS;

const ROOTS: Readonly<Record<OrchardAssetTarget, string>> = {
  miniprogram: "miniprogram/assets/orchard",
  source: "design-assets/source",
  web: "admin-web/src/assets/orchard",
};

export function resolveOrchardAsset(key: OrchardAssetKey, target: OrchardAssetTarget): string {
  const definition = ORCHARD_ASSETS[key];
  if (definition === undefined) {
    throw new Error(`未登记的果园插画资源：${String(key)}`);
  }
  return `${ROOTS[target]}/${definition.fileName}`;
}

function asset(
  fileName: string,
  alt: string,
  slot: OrchardAssetDefinition["slot"],
): OrchardAssetDefinition {
  return { alt, fileName, slot };
}
