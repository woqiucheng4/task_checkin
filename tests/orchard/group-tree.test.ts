import { describe, expect, it } from "vitest";

import { GroupOrchardService } from "../../src/application/group-orchard-service.js";
import { ReviewService } from "../../src/application/review-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("group co-growing tree", () => {
  it("adds one contribution on the first academic approval only", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const groupOrchard = new GroupOrchardService(seed.harness);
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);
    const groupTree = await groupOrchard.startGroupTree(seed.teacher, {
      catalogId: "ordinary-pear",
      groupId: seed.group.id,
      requestId: "group-tree-start-1",
    });
    const request = {
      assignmentId: seed.assignment.id,
      decision: "APPROVE" as const,
      requestId: "group-tree-review-1",
    };

    await reviews.academicReview(seed.teacher, request);
    await reviews.academicReview(seed.teacher, request);

    expect(
      await seed.harness.repository.query("groupContributions", {
        assignmentId: seed.assignment.id,
      }),
    ).toMatchObject([{ amount: 1, groupTreeId: groupTree.id }]);
    expect(await seed.harness.repository.read("groupTrees", groupTree.id)).toMatchObject({
      progress: 1,
    });
    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(0);
  });

  it("matures and harvests one memorial when aggregate progress reaches the threshold", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const groupOrchard = new GroupOrchardService(seed.harness);
    const reviews = new ReviewService(seed.harness, new SunlightService(seed.harness));
    const groupTree = await groupOrchard.startGroupTree(seed.teacher, {
      catalogId: "ordinary-pear",
      groupId: seed.group.id,
      requestId: "group-tree-start-mature",
    });
    await seed.harness.repository.transaction((tx) =>
      tx.update("groupTrees", groupTree.id, {
        progress: groupTree.threshold - 1,
        updatedAt: seed.harness.clock.now(),
      }),
    );
    await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "group-tree-review-mature",
    });

    const harvested = await groupOrchard.harvestGroupTree(seed.teacher, {
      groupTreeId: groupTree.id,
      requestId: "group-tree-harvest-1",
      title: "我们一起长大的梨树",
    });

    expect(harvested.tree.status).toBe("HARVESTED");
    expect(harvested.memorial).toMatchObject({
      groupId: seed.group.id,
      title: "我们一起长大的梨树",
    });
  });

  it("does not create a group contribution for a family task", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const reviews = new ReviewService(seed.harness, new SunlightService(seed.harness));
    await reviews.familyReview(seed.guardian, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "family-no-group-review",
    });

    expect(await seed.harness.repository.query("groupContributions")).toHaveLength(0);
  });
});
