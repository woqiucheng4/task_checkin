import type { ApplicationDependencies, Transaction } from "./ports.js";
import type {
  ActorContext,
  FruitCollection,
  FruitWishLink,
  GuardianLink,
  Wish,
} from "../domain/model.js";
import { AccessPolicy } from "../domain/policy.js";
import { activeFruitReservation } from "../domain/wishes.js";
import { DomainError } from "../shared/errors.js";

interface RequestBase {
  readonly requestId: string;
  readonly childId: string;
}

export interface FamilyWishView {
  readonly wishes: readonly Wish[];
  readonly links: readonly FruitWishLink[];
  readonly fruits: readonly FruitCollection[];
}

export class WishService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async createWish(
    actor: ActorContext,
    input: RequestBase & { readonly childId: string; readonly title: string },
  ): Promise<Wish> {
    const guardian = await this.requireAdultGuardian(actor, input.childId);
    requireRequestId(input.requestId);
    const title = validTitle(input.title);
    const now = this.dependencies.clock.now();
    const wish: Wish = {
      id: this.dependencies.ids.next("wish"),
      childId: input.childId,
      createdAt: now,
      familyId: guardian.familyId,
      status: "ACTIVE",
      title,
      updatedAt: now,
    };
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("wishes", wish);
      await this.audit(tx, actor, input.requestId, "WISH_CREATED", guardian.familyId, wish.id);
      return wish;
    });
  }

  async updateWish(
    actor: ActorContext,
    input: RequestBase & { readonly wishId: string; readonly title: string },
  ): Promise<Wish> {
    const { guardian, wish } = await this.requireGuardianWish(actor, input.wishId, input.childId);
    requireRequestId(input.requestId);
    if (wish.status !== "ACTIVE") {
      throw new DomainError("CONFLICT", "只有进行中的愿望可以修改");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const updated = await tx.update("wishes", wish.id, {
        title: validTitle(input.title),
        updatedAt: now,
      });
      await this.audit(tx, actor, input.requestId, "WISH_UPDATED", guardian.familyId, wish.id);
      return updated;
    });
  }

  async archiveWish(
    actor: ActorContext,
    input: RequestBase & { readonly wishId: string },
  ): Promise<Wish> {
    const { guardian, wish } = await this.requireGuardianWish(actor, input.wishId, input.childId);
    requireRequestId(input.requestId);
    if (wish.status !== "ACTIVE") {
      throw new DomainError("CONFLICT", "只有进行中的愿望可以归档");
    }
    const links = await this.dependencies.repository.query("fruitWishLinks", { wishId: wish.id });
    const active = links.some(
      (link) => activeFruitReservation(links, wish.id, link.fruitCollectionId) > 0,
    );
    if (active) {
      throw new DomainError("CONFLICT", "请先解除水果关联再归档愿望");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      const archived = await tx.update("wishes", wish.id, {
        status: "ARCHIVED",
        updatedAt: now,
      });
      await this.audit(tx, actor, input.requestId, "WISH_ARCHIVED", guardian.familyId, wish.id);
      return archived;
    });
  }

  async linkFruit(
    actor: ActorContext,
    input: RequestBase & {
      readonly wishId: string;
      readonly fruitCollectionId: string;
      readonly quantity: number;
    },
  ): Promise<FruitWishLink> {
    const { guardian, wish } = await this.requireGuardianWish(actor, input.wishId, input.childId);
    requireRequestId(input.requestId);
    requireQuantity(input.quantity);
    if (wish.status !== "ACTIVE") {
      throw new DomainError("CONFLICT", "只能给进行中的愿望关联水果");
    }
    const fruit = await this.requireOwnedFruit(input.fruitCollectionId, wish.childId);
    if (fruit.quantity - fruit.reservedQuantity < input.quantity) {
      throw new DomainError("CONFLICT", "可关联的水果数量不足");
    }
    const now = this.dependencies.clock.now();
    const link = this.makeLink(wish, fruit, input.quantity, "RESERVED", input.requestId, now);
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("fruitWishLinks", link);
      await tx.update("fruitCollections", fruit.id, {
        reservedQuantity: fruit.reservedQuantity + input.quantity,
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "FRUIT_LINKED_TO_WISH",
        guardian.familyId,
        wish.id,
      );
      return link;
    });
  }

  async unlinkFruit(
    actor: ActorContext,
    input: RequestBase & {
      readonly wishId: string;
      readonly fruitCollectionId: string;
      readonly quantity: number;
    },
  ): Promise<FruitWishLink> {
    const { guardian, wish } = await this.requireGuardianWish(actor, input.wishId, input.childId);
    requireRequestId(input.requestId);
    requireQuantity(input.quantity);
    const fruit = await this.requireOwnedFruit(input.fruitCollectionId, wish.childId);
    const links = await this.dependencies.repository.query("fruitWishLinks", { wishId: wish.id });
    if (activeFruitReservation(links, wish.id, fruit.id) < input.quantity) {
      throw new DomainError("CONFLICT", "解除数量超过已关联水果");
    }
    const now = this.dependencies.clock.now();
    const link = this.makeLink(wish, fruit, input.quantity, "RELEASED", input.requestId, now);
    return this.dependencies.repository.transaction(async (tx) => {
      await tx.insert("fruitWishLinks", link);
      await tx.update("fruitCollections", fruit.id, {
        reservedQuantity: fruit.reservedQuantity - input.quantity,
        updatedAt: now,
      });
      await this.audit(
        tx,
        actor,
        input.requestId,
        "FRUIT_UNLINKED_FROM_WISH",
        guardian.familyId,
        wish.id,
      );
      return link;
    });
  }

  async fulfillWish(
    actor: ActorContext,
    input: RequestBase & { readonly wishId: string },
  ): Promise<Wish> {
    const { guardian, wish } = await this.requireGuardianWish(actor, input.wishId, input.childId);
    requireRequestId(input.requestId);
    if (wish.status !== "ACTIVE") {
      throw new DomainError("CONFLICT", "只有进行中的愿望可以完成");
    }
    const links = await this.dependencies.repository.query("fruitWishLinks", { wishId: wish.id });
    const fruitIds = [...new Set(links.map((link) => link.fruitCollectionId))];
    const reservations = fruitIds
      .map((fruitCollectionId) => ({
        fruitCollectionId,
        quantity: activeFruitReservation(links, wish.id, fruitCollectionId),
      }))
      .filter((reservation) => reservation.quantity > 0);
    if (reservations.length === 0) {
      throw new DomainError("CONFLICT", "愿望至少需要关联一个水果");
    }
    const now = this.dependencies.clock.now();
    return this.dependencies.repository.transaction(async (tx) => {
      for (const reservation of reservations) {
        const fruit = await this.requireOwnedFruit(reservation.fruitCollectionId, wish.childId, tx);
        await tx.insert(
          "fruitWishLinks",
          this.makeLink(wish, fruit, reservation.quantity, "CONSUMED", input.requestId, now),
        );
        await tx.update("fruitCollections", fruit.id, {
          reservedQuantity: fruit.reservedQuantity - reservation.quantity,
          updatedAt: now,
        });
      }
      const fulfilled = await tx.update("wishes", wish.id, {
        fulfilledAt: now,
        status: "FULFILLED",
        updatedAt: now,
      });
      await this.audit(tx, actor, input.requestId, "WISH_FULFILLED", guardian.familyId, wish.id);
      return fulfilled;
    });
  }

  async familyWishView(actor: ActorContext, childId: string): Promise<FamilyWishView> {
    await this.policy.requireChildScope(actor, childId);
    return {
      fruits: await this.dependencies.repository.query("fruitCollections", { childId }),
      links: await this.dependencies.repository.query("fruitWishLinks", { childId }),
      wishes: await this.dependencies.repository.query("wishes", { childId }),
    };
  }

  private async requireAdultGuardian(actor: ActorContext, childId: string): Promise<GuardianLink> {
    if (actor.mode !== "ACCOUNT") {
      throw new DomainError("FORBIDDEN", "只有成人监护人可以管理愿望");
    }
    return this.policy.requireChildScope(actor, childId);
  }

  private async requireGuardianWish(
    actor: ActorContext,
    wishId: string,
    childId: string,
  ): Promise<{ guardian: GuardianLink; wish: Wish }> {
    const wish = await this.dependencies.repository.read("wishes", wishId);
    if (wish === undefined) {
      throw new DomainError("NOT_FOUND", "愿望不存在");
    }
    const guardian = await this.requireAdultGuardian(actor, childId);
    if (guardian.familyId !== wish.familyId || guardian.childId !== wish.childId) {
      throw new DomainError("FORBIDDEN", "愿望不属于当前家庭");
    }
    return { guardian, wish };
  }

  private async requireOwnedFruit(
    fruitCollectionId: string,
    childId: string,
    repository: Pick<Transaction, "read"> = this.dependencies.repository,
  ): Promise<FruitCollection> {
    const fruit = await repository.read("fruitCollections", fruitCollectionId);
    if (fruit?.childId !== childId) {
      throw new DomainError("FORBIDDEN", "水果不属于该孩子");
    }
    return fruit;
  }

  private makeLink(
    wish: Wish,
    fruit: FruitCollection,
    quantity: number,
    action: FruitWishLink["action"],
    requestId: string,
    createdAt: string,
  ): FruitWishLink {
    return {
      id: this.dependencies.ids.next("fruit_wish_link"),
      action,
      childId: wish.childId,
      createdAt,
      familyId: wish.familyId,
      fruitCollectionId: fruit.id,
      quantity,
      requestId,
      wishId: wish.id,
    };
  }

  private async audit(
    tx: Transaction,
    actor: ActorContext,
    requestId: string,
    action: string,
    familyId: string,
    resourceId: string,
  ): Promise<void> {
    await tx.appendAudit({
      id: this.dependencies.ids.next("audit"),
      action,
      actorAccountId: actor.accountId,
      createdAt: this.dependencies.clock.now(),
      metadata: {},
      requestId,
      resourceId,
      resourceType: action,
      tenantScope: { kind: "FAMILY", familyId },
    });
  }
}

function validTitle(value: string): string {
  const title = value.trim();
  if (title.length < 1 || title.length > 80) {
    throw new DomainError("INVALID_INPUT", "愿望标题长度必须是 1 至 80 个字符");
  }
  return title;
}

function requireQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new DomainError("INVALID_INPUT", "水果数量必须是 1 至 99 的整数");
  }
}

function requireRequestId(requestId: string): void {
  if (requestId.trim().length < 8) {
    throw new DomainError("INVALID_COMMAND", "requestId 长度不足");
  }
}
