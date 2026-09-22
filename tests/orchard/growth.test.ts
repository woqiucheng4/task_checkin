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
  it("matures the starter apple at thirty sunlight and carries excess forward", () => {
    const tree: ChildTree = {
      id: "tree-1",
      carryOver: 0,
      catalogId: starter.id,
      childId: "child-1",
      createdAt: "2026-09-05T09:00:00.000Z",
      progress: 29,
      stage: growthStageFor(starter, 29),
      status: "GROWING",
      updatedAt: "2026-09-05T09:00:00.000Z",
    };

    const result = applySunlight(tree, starter, 3, "2026-09-05T10:00:00.000Z");

    expect(result.tree).toMatchObject({
      carryOver: 2,
      progress: 30,
      status: "MATURE",
    });
    expect(result.visualEvent).toMatchObject({ kind: "TREE_MATURED", sunlightApplied: 1 });
  });

  it("lets the first two ordinary rewards advance one early stage each", () => {
    expect(growthStageFor(starter, 0)).toBe("种子");
    expect(growthStageFor(starter, 2)).toBe("破土");
    expect(growthStageFor(starter, 4)).toBe("嫩芽");
  });

  it("requires progressively more sunlight for later visual stages", () => {
    expect(growthStageFor(starter, 10)).toBe("花苞");
    expect(growthStageFor(starter, 12)).toBe("花苞");
    expect(growthStageFor(starter, 14)).toBe("开花");
    expect(growthStageFor(starter, 30)).toBe("成熟采摘");
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

  it("upgrades the legacy starter catalog to the current growth curve", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    await seed.harness.repository.transaction((tx) =>
      tx.insert("treeCatalog", {
        ...starter,
        stages: [
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
        ],
        threshold: 6,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    await new OrchardService(seed.harness).startTree(seed.childActor, {
      childId: seed.firstChild.id,
      catalogId: starter.id,
      requestId: "orchard-upgrade-legacy-catalog",
    });

    const catalog = await seed.harness.repository.read("treeCatalog", starter.id);
    expect(catalog).toMatchObject({ threshold: 30 });
    expect(catalog?.stages.slice(0, 2)).toEqual([
      { minimumRatio: 0, name: "种子" },
      { minimumRatio: 0.04, name: "破土" },
    ]);
  });

  it("applies carry-over to the next selected tree without changing lifetime sunlight", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);
    const orchard = new OrchardService(seed.harness);
    await sunlight.grantForAssignment(seed.platform, {
      amount: 32,
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
    ).toBe(32);
  });
});
