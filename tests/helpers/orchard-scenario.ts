import { OrchardService } from "../../src/application/orchard-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "./task-scenario.js";

export async function createHarvestedFruitScenario() {
  const seed = await createSubmittedTaskScenario("FAMILY");
  const sunlight = new SunlightService(seed.harness);
  const orchard = new OrchardService(seed.harness);
  await sunlight.grantForAssignment(seed.platform, {
    amount: 6,
    assignmentId: seed.assignment.id,
    reason: "MANUAL_CORRECTION",
    requestId: "wish-mature-grant",
  });
  const beforeHarvest = await orchard.orchardForChild(seed.childActor, seed.firstChild.id);
  if (beforeHarvest.currentTree === undefined) {
    throw new Error("wish scenario mature tree missing");
  }
  const harvest = await orchard.harvestTree(seed.childActor, {
    childId: seed.firstChild.id,
    name: "愿望苹果树",
    requestId: "wish-tree-harvest",
    treeId: beforeHarvest.currentTree.id,
  });
  return { ...seed, harvest, orchard, sunlight };
}
