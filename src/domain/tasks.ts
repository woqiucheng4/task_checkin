import type { CalendarDate, TaskSchedule } from "./model.js";
import { DomainError } from "../shared/errors.js";

export function isScheduledOn(schedule: TaskSchedule, date: CalendarDate): boolean {
  assertCalendarDate(date);
  if (schedule.kind === "ONCE") {
    return schedule.date === date;
  }
  if (date < schedule.startDate || (schedule.endDate !== undefined && date > schedule.endDate)) {
    return false;
  }
  if (schedule.kind === "DAILY") {
    return true;
  }
  const weekday = isoWeekday(date);
  return schedule.weekdays.includes(weekday);
}

export function assignmentBusinessKey(
  taskId: string,
  recipientId: string,
  occurrenceDate: CalendarDate,
): string {
  if (taskId.length === 0 || recipientId.length === 0) {
    throw new DomainError("INVALID_INPUT", "任务和接收人不能为空");
  }
  assertCalendarDate(occurrenceDate);
  return `${taskId}:${recipientId}:${occurrenceDate}`;
}

export function assertValidSchedule(schedule: TaskSchedule): void {
  if (schedule.kind === "ONCE") {
    assertCalendarDate(schedule.date);
    return;
  }
  assertCalendarDate(schedule.startDate);
  if (schedule.endDate !== undefined) {
    assertCalendarDate(schedule.endDate);
    if (schedule.endDate < schedule.startDate) {
      throw new DomainError("INVALID_INPUT", "周期结束日期不能早于开始日期");
    }
  }
  if (schedule.kind === "WEEKLY") {
    if (
      schedule.weekdays.length === 0 ||
      new Set(schedule.weekdays).size !== schedule.weekdays.length ||
      schedule.weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)
    ) {
      throw new DomainError("INVALID_INPUT", "星期配置必须是 1 至 7 的不重复数字");
    }
  }
}

function isoWeekday(date: CalendarDate): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function assertCalendarDate(date: CalendarDate): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new DomainError("INVALID_INPUT", "日期必须使用 YYYY-MM-DD 格式");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new DomainError("INVALID_INPUT", "日历日期无效");
  }
}
