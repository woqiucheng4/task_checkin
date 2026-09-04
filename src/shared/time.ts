import { DomainError } from "./errors.js";

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export interface Clock {
  now(): string;
}

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

export class FixedClock implements Clock {
  constructor(private current: string) {}

  now(): string {
    return this.current;
  }

  set(instant: string): void {
    assertInstant(instant);
    this.current = instant;
  }
}

export function shanghaiDateAt(instant: string): string {
  const date = parseInstant(instant);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shanghaiMinutesOfDay(instant: string): number {
  const date = parseInstant(instant);
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: SHANGHAI_TIME_ZONE,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

export function isLateSameDayPublication(input: {
  dueDate: string;
  publishedAt: string;
  cutoffHour?: number;
}): boolean {
  const cutoffHour = input.cutoffHour ?? 18;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || cutoffHour < 0 || cutoffHour > 23) {
    throw new DomainError("INVALID_INPUT", "日期或截止小时无效");
  }

  return (
    shanghaiDateAt(input.publishedAt) === input.dueDate &&
    shanghaiMinutesOfDay(input.publishedAt) >= cutoffHour * 60
  );
}

function parseInstant(instant: string): Date {
  const date = new Date(instant);
  if (Number.isNaN(date.valueOf())) {
    throw new DomainError("INVALID_INPUT", "时间格式无效");
  }
  return date;
}

function assertInstant(instant: string): void {
  parseInstant(instant);
}
