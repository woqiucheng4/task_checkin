import { describe, expect, it } from "vitest";

import { OrchardService } from "../../src/application/orchard-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { DEFAULT_TREE_CATALOGS, applySunlight, growthStageFor } from "../../src/domain/orchard.js";
import type { ChildTree } from "../../src/domain/model.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

const starter = DEFAULT_TREE_CATALOGS[0];
if (starter === undefined) {
  throw new Error("starter catalog fixture missing");
}

describe("orchard growth rules", () => {
  it("matures the starter apple at six sunlight and carries excess forward", () => {
    const tree: ChildTree = {
      id: "tree-1",
      carryOver: 0,
      catalogId: starter.id,
      childId: "child-1",
      createdAt: "2026-09-05T09:00:00.000Z",
      progress: 5,
      stage: growthStageFor(starter, 5),
      status: "GROWING",
      updatedAt: "2026-09-05T09:00:00.000Z",
    };

    const result = applySunlight(tree, starter, 3, "2026-09-05T10:00:00.000Z");

    expect(result.tree).toMatchObject({
      carryOver: 2,
      progress: 6,
      status: "MATURE",
    });
    expect(result.visualEvent).toMatchObject({ kind: "TREE_MATURED", sunlightApplied: 1 });
  });

  it("derives growth stages from catalog boundaries", () => {
    expect(growthStageFor(starter, 0)).toBe("种子");
    expect(growthStageFor(starter, 3)).toBe("开花");
    expect(growthStageFor(starter, 6)).toBe("成熟采摘");
  });

  it("automatically starts the first apple tree when sunlight arrives", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);

    await sunlight.grantForAssignment(seed.platform, {
      amount: 2,
      assignmentId: seed.assignment.id,
      reason: "MANUAL_CORRECTION",
      requestId: "orchard-first-grant",
    });

    const orchard = await new OrchardService(seed.harness).orchardForChild(
      seed.childActor,
      seed.firstChild.id,
    );
    expect(orchard.currentTree).toMatchObject({
      catalogId: "starter-apple",
      progress: 2,
      status: "GROWING",
    });
  });

  it("applies carry-over to the next selected tree without changing lifetime sunlight", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);
    const orchard = new OrchardService(seed.harness);
    await sunlight.grantForAssignment(seed.platform, {
      amount: 8,
      assignmentId: seed.assignment.id,
      reason: "MANUAL_CORRECTION",
      requestId: "orchard-carry-grant",
    });
    const first = await orchard.orchardForChild(seed.childActor, seed.firstChild.id);
    if (first.currentTree === undefined) {
      throw new Error("starter tree missing");
    }
    await orchard.harvestTree(seed.childActor, {
      childId: seed.firstChild.id,
      name: "第一棵苹果树",
      requestId: "orchard-carry-harvest",
      treeId: first.currentTree.id,
    });

    const next = await orchard.startTree(seed.childActor, {
      childId: seed.firstChild.id,
      catalogId: "ordinary-pear",
      requestId: "orchard-next-tree",
    });

    expect(next).toMatchObject({ carryOver: 0, progress: 2, status: "GROWING" });
    expect(
      (await orchard.orchardForChild(seed.childActor, seed.firstChild.id)).lifetimeSunlight,
    ).toBe(8);
  });
});
