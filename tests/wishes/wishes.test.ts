import { describe, expect, it } from "vitest";

import { WishService } from "../../src/application/wish-service.js";
import { createHarvestedFruitScenario } from "../helpers/orchard-scenario.js";

describe("family wishes", () => {
  it("lets a guardian link harvested fruit and fulfill a wish", async () => {
    const seed = await createHarvestedFruitScenario();
    const wishes = new WishService(seed.harness);
    const wish = await wishes.createWish(seed.guardian, {
      childId: seed.firstChild.id,
      requestId: "wish-create-1",
      title: "周末去动物园",
    });
    await wishes.linkFruit(seed.guardian, {
      fruitCollectionId: seed.harvest.fruit.id,
      quantity: 1,
      requestId: "wish-link-1",
      wishId: wish.id,
    });

    const fulfilled = await wishes.fulfillWish(seed.guardian, {
      requestId: "wish-fulfill-1",
      wishId: wish.id,
    });

    expect(fulfilled.status).toBe("FULFILLED");
    expect(
      await seed.harness.repository.read("fruitCollections", seed.harvest.fruit.id),
    ).toMatchObject({ quantity: 1, reservedQuantity: 0 });
    expect(
      await seed.harness.repository.query("fruitWishLinks", { wishId: wish.id }),
    ).toMatchObject([{ action: "RESERVED" }, { action: "CONSUMED" }]);
  });

  it("rejects reserving more fruit than the child has harvested", async () => {
    const seed = await createHarvestedFruitScenario();
    const wishes = new WishService(seed.harness);
    const wish = await wishes.createWish(seed.guardian, {
      childId: seed.firstChild.id,
      requestId: "wish-create-overflow",
      title: "去科技馆",
    });

    await expect(
      wishes.linkFruit(seed.guardian, {
        fruitCollectionId: seed.harvest.fruit.id,
        quantity: 2,
        requestId: "wish-link-overflow",
        wishId: wish.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("releases a fruit reservation without deleting the permanent fruit", async () => {
    const seed = await createHarvestedFruitScenario();
    const wishes = new WishService(seed.harness);
    const wish = await wishes.createWish(seed.guardian, {
      childId: seed.firstChild.id,
      requestId: "wish-create-release",
      title: "做一次烘焙",
    });
    await wishes.linkFruit(seed.guardian, {
      fruitCollectionId: seed.harvest.fruit.id,
      quantity: 1,
      requestId: "wish-link-release",
      wishId: wish.id,
    });

    await wishes.unlinkFruit(seed.guardian, {
      fruitCollectionId: seed.harvest.fruit.id,
      quantity: 1,
      requestId: "wish-unlink-release",
      wishId: wish.id,
    });

    expect(
      await seed.harness.repository.read("fruitCollections", seed.harvest.fruit.id),
    ).toMatchObject({ quantity: 1, reservedQuantity: 0 });
  });

  it("updates and archives an unfulfilled wish", async () => {
    const seed = await createHarvestedFruitScenario();
    const wishes = new WishService(seed.harness);
    const wish = await wishes.createWish(seed.guardian, {
      childId: seed.firstChild.id,
      requestId: "wish-create-edit",
      title: "旧愿望",
    });

    const updated = await wishes.updateWish(seed.guardian, {
      requestId: "wish-update-edit",
      title: "新愿望",
      wishId: wish.id,
    });
    const archived = await wishes.archiveWish(seed.guardian, {
      requestId: "wish-archive-edit",
      wishId: wish.id,
    });

    expect(updated.title).toBe("新愿望");
    expect(archived.status).toBe("ARCHIVED");
  });
});
