import { createHash, randomUUID } from "node:crypto";

export function commandReceiptId(
  namespace: string,
  accountId: string,
  action: string,
  requestId: string,
): string {
  return `${namespace}_${createHash("sha256")
    .update(JSON.stringify([accountId, action, requestId]))
    .digest("hex")}`;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export class CryptoIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }
}

export class SequenceIdGenerator implements IdGenerator {
  private value = 0;

  next(prefix: string): string {
    this.value += 1;
    return `${prefix}_${this.value}`;
  }
}
