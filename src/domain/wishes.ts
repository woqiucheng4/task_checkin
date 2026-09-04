import type { FruitWishLink } from "./model.js";

export function activeFruitReservation(
  links: readonly FruitWishLink[],
  wishId: string,
  fruitCollectionId: string,
): number {
  return links
    .filter((link) => link.wishId === wishId && link.fruitCollectionId === fruitCollectionId)
    .reduce((total, link) => {
      if (link.action === "RESERVED") {
        return total + link.quantity;
      }
      return total - link.quantity;
    }, 0);
}
