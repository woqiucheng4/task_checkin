import { describe, expect, it } from "vitest";
import { AGE_DENSITY, DESIGN_TOKENS } from "../../src/presentation/design-tokens.js";
import { ORCHARD_ASSETS, resolveOrchardAsset } from "../../src/presentation/asset-manifest.js";

describe("watercolor orchard design system", () => {
  it("preserves the confirmed paper, forest, and tomato visual hierarchy", () => {
    expect(DESIGN_TOKENS.color).toMatchObject({
      forest: "#174E2A",
      paper: "#FAF7EE",
      tomato: "#D93A22",
    });
    expect(DESIGN_TOKENS.color.tomato).not.toBe(DESIGN_TOKENS.color.danger);
    expect(DESIGN_TOKENS.motion.reduced).toBe(0);
  });

  it("defines distinct low- and high-grade density without changing semantic colors", () => {
    expect(Object.keys(AGE_DENSITY)).toEqual(["LOWER_PRIMARY", "UPPER_PRIMARY"]);
    expect(AGE_DENSITY.LOWER_PRIMARY.taskTargetRpx).toBeGreaterThanOrEqual(88);
    expect(AGE_DENSITY.UPPER_PRIMARY.taskGapRpx).toBeLessThan(AGE_DENSITY.LOWER_PRIMARY.taskGapRpx);
  });

  it("resolves every registered illustration to each product target", () => {
    expect(ORCHARD_ASSETS).toHaveProperty("apple.mature");
    expect(resolveOrchardAsset("apple.mature", "miniprogram")).toBe(
      "miniprogram/assets/orchard/apple-mature.png",
    );
    expect(resolveOrchardAsset("apple.mature", "web")).toBe(
      "admin-web/src/assets/orchard/apple-mature.png",
    );
    expect(() =>
      resolveOrchardAsset("missing.asset" as keyof typeof ORCHARD_ASSETS, "source"),
    ).toThrow(/未登记/);
  });
});
