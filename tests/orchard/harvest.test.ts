import { describe, expect, it } from "vitest";

import { OrchardService } from "../../src/application/orchard-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

async function matureTreeScenario() {
  const seed = await createSubmittedTaskScenario("FAMILY");
  const sunlight = new SunlightService(seed.harness);
  const orchard = new OrchardService(seed.harness);
  await sunlight.grantForAssignment(seed.platform, {
    amount: 6,
    assignmentId: seed.assignment.id,
    reason: "MANUAL_CORRECTION",
    requestId: "harvest-mature-grant",
  });
  const view = await orchard.orchardForChild(seed.childActor, seed.firstChild.id);
  if (view.currentTree === undefined) {
    throw new Error("mature tree fixture missing");
  }
  return { ...seed, orchard, sunlight, tree: view.currentTree };
}

describe("orchard harvest", () => {
  it("harvests one mature tree into permanent tree, fruit, and growth-card collections", async () => {
    const seed = await matureTreeScenario();

    const result = await seed.orchard.harvestTree(seed.childActor, {
      childId: seed.firstChild.id,
      name: "小勇气",
      requestId: "harvest-tree-1",
      treeId: seed.tree.id,
    });

    expect(result.tree).toMatchObject({ name: "小勇气", status: "HARVESTED" });
    expect(result.fruit).toMatchObject({ quantity: 1, reservedQuantity: 0 });
    expect(result.growthCard).toMatchObject({ treeId: seed.tree.id, title: "小勇气" });
    expect(
      (await seed.orchard.orchardForChild(seed.childActor, seed.firstChild.id)).harvestedTrees,
    ).toHaveLength(1);
  });

  it("returns the same harvest result for a repeated request id", async () => {
    const seed = await matureTreeScenario();
    const request = {
      childId: seed.firstChild.id,
      name: "小勇气",
      requestId: "harvest-repeat-1",
      treeId: seed.tree.id,
    };

    const first = await seed.orchard.harvestTree(seed.childActor, request);
    const repeated = await seed.orchard.harvestTree(seed.childActor, request);

    expect(repeated.growthCard.id).toBe(first.growthCard.id);
    expect(repeated.fruit.quantity).toBe(1);
  });

  it("renames a tree owned by the selected child", async () => {
    const seed = await matureTreeScenario();

    const renamed = await seed.orchard.renameTree(seed.childActor, {
      childId: seed.firstChild.id,
      name: "我的苹果树",
      requestId: "rename-tree-1",
      treeId: seed.tree.id,
    });

    expect(renamed.name).toBe("我的苹果树");
  });
});
