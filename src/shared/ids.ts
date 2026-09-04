import { randomUUID } from "node:crypto";

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
