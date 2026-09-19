import { describe, expect, it } from "vitest";
import type { FruitCollection, Task, TaskAssignment, Wish } from "../../src/domain/model.js";
import type { HarvestResult, OrchardView } from "../../src/application/orchard-service.js";
import type { FamilyWishView } from "../../src/application/wish-service.js";
import { AcceptanceScenario, ORDINARY_TASK } from "./scenario.js";

describe("family growth orchard acceptance", () => {
  it("AC-FAMILY-001 completes three tasks, harvests the first apple, and links a private wish", async () => {
    const scenario = new AcceptanceScenario();
    const family = await scenario.createFamilyWithChild();
    const childActor = { mode: "ACCOUNT" as const };

    for (let index = 1; index <= 3; index += 1) {
      const task = await scenario.call<Task>(family.openId, "PUBLISH_FAMILY_TASK", {
        ...ORDINARY_TASK,
        childIds: [family.child.id],
        familyId: family.family.id,
        title: `数学练习 ${index}`,
      });
      const assignment = (
        await scenario.harness.repository.query("taskAssignments", { taskId: task.id })
      )[0] as TaskAssignment;
      await scenario.call(
        family.openId,
        "SUBMIT_TASK",
        { childId: family.child.id, assignmentId: assignment.id, mediaAssetIds: [] },
        { actor: childActor },
      );
      await scenario.call(family.openId, "FAMILY_REVIEW", {
        childId: family.child.id,
        assignmentId: assignment.id,
        decision: "APPROVE",
      });
    }

    const orchard = await scenario.call<OrchardView>(
      family.openId,
      "GET_CHILD_ORCHARD",
      { childId: family.child.id },
      { actor: childActor },
    );
    expect(orchard).toMatchObject({
      currentTree: { catalogId: "starter-apple", progress: 6, status: "MATURE" },
      lifetimeSunlight: 6,
    });

    const harvest = await scenario.call<HarvestResult>(
      family.openId,
      "HARVEST_TREE",
      { childId: family.child.id, name: "第一棵苹果树", treeId: orchard.currentTree?.id },
      { actor: childActor },
    );
    const wish = await scenario.call<Wish>(family.openId, "CREATE_WISH", {
      childId: family.child.id,
      title: "周末去科技馆",
    });
    await scenario.call(family.openId, "LINK_FRUIT", {
      childId: family.child.id,
      fruitCollectionId: harvest.fruit.id,
      quantity: 1,
      wishId: wish.id,
    });

    const view = await scenario.call<FamilyWishView>(family.openId, "GET_FAMILY_WISHES", {
      childId: family.child.id,
    });
    expect(view).toMatchObject({
      fruits: [{ reservedQuantity: 1 } satisfies Partial<FruitCollection>],
      wishes: [{ title: "周末去科技馆" }],
    });
    expect(
      await scenario.call<OrchardView>(
        family.openId,
        "GET_CHILD_ORCHARD",
        { childId: family.child.id },
        { actor: childActor },
      ),
    ).toMatchObject({ harvestedTrees: [{ name: "第一棵苹果树" }] });
  });
});
