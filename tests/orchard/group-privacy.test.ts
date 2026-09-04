import { describe, expect, it } from "vitest";

import { GroupOrchardService } from "../../src/application/group-orchard-service.js";
import { ReviewService } from "../../src/application/review-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("group orchard child privacy", () => {
  it("contains aggregate progress without contributor identity or ranking", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const groupOrchard = new GroupOrchardService(seed.harness);
    await groupOrchard.startGroupTree(seed.teacher, {
      catalogId: "ordinary-pear",
      groupId: seed.group.id,
      requestId: "group-private-start",
    });
    await new ReviewService(seed.harness, new SunlightService(seed.harness)).academicReview(
      seed.teacher,
      {
        assignmentId: seed.assignment.id,
        decision: "APPROVE",
        requestId: "group-private-review",
      },
    );

    const view = await groupOrchard.groupProgressForChild(seed.childActor, seed.group.id);

    expect(view).toEqual({
      progress: 1,
      stage: expect.any(String),
      status: "GROWING",
      threshold: 20,
      treeId: expect.any(String),
    });
    expect(JSON.stringify(view)).not.toMatch(/child|member|contributor|rank/i);
  });

  it("rejects a child who is not an active member of the group", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const groupOrchard = new GroupOrchardService(seed.harness);
    await groupOrchard.startGroupTree(seed.teacher, {
      catalogId: "ordinary-pear",
      groupId: seed.group.id,
      requestId: "group-outsider-start",
    });
    await seed.harness.repository.transaction((tx) =>
      tx.update("childGroupMemberships", seed.memberships[0]?.id ?? "", {
        status: "WITHDRAWN",
        updatedAt: seed.harness.clock.now(),
      }),
    );

    await expect(
      groupOrchard.groupProgressForChild(seed.childActor, seed.group.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
