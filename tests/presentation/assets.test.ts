import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ORCHARD_ASSETS,
  resolveOrchardAsset,
  type OrchardAssetTarget,
} from "../../src/presentation/asset-manifest.js";

const targets: readonly OrchardAssetTarget[] = ["source", "miniprogram", "web"];

describe("果园插画资源", () => {
  it.each(Object.keys(ORCHARD_ASSETS))("在三端完整提供 %s", (key) => {
    for (const target of targets) {
      const path = resolveOrchardAsset(key as keyof typeof ORCHARD_ASSETS, target);
      expect(statSync(path).size).toBeGreaterThan(10_000);
      expect(readFileSync(path).subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    }
  });
});
