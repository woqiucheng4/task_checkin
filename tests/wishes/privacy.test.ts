import { describe, expect, it } from "vitest";

import { WishService } from "../../src/application/wish-service.js";
import { createHarvestedFruitScenario } from "../helpers/orchard-scenario.js";

describe("wish privacy", () => {
  it("lets the selected child and guardian read only their family wish view", async () => {
    const seed = await createHarvestedFruitScenario();
    const wishes = new WishService(seed.harness);
    await wishes.createWish(seed.guardian, {
      childId: seed.firstChild.id,
      requestId: "wish-private-create",
      title: "家庭小愿望",
    });

    await expect(wishes.familyWishView(seed.childActor, seed.firstChild.id)).resolves.toMatchObject(
      {
        wishes: [{ title: "家庭小愿望" }],
      },
    );
    await expect(wishes.familyWishView(seed.guardian, seed.firstChild.id)).resolves.toMatchObject({
      wishes: [{ title: "家庭小愿望" }],
    });
  });

  it("denies every teacher access to family wishes", async () => {
    const seed = await createHarvestedFruitScenario();
    const wishes = new WishService(seed.harness);
    await wishes.createWish(seed.guardian, {
      childId: seed.firstChild.id,
      requestId: "wish-teacher-create",
      title: "不能给老师看",
    });

    await expect(wishes.familyWishView(seed.teacher, seed.firstChild.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("keeps wish mutation in adult guardian mode", async () => {
    const seed = await createHarvestedFruitScenario();
    const wishes = new WishService(seed.harness);

    await expect(
      wishes.createWish(
        {
          ...seed.guardian,
          mode: "CHILD",
        } as unknown as import("../../src/domain/model.js").ActorContext,
        {
          childId: seed.firstChild.id,
          requestId: "wish-child-mutate",
          title: "孩子不能自行兑换",
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
