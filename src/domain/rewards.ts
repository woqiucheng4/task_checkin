import type { Family, Task, TaskAssignment } from "./model.js";
import { DomainError } from "../shared/errors.js";

export function taskRewardAmount(family: Family, task: Task, assignment: TaskAssignment): number {
  if (task.importance === "CHALLENGE") {
    return family.defaultRewards.challenge;
  }
  if (task.importance === "FOCUS" || assignment.familyFocusRank !== undefined) {
    return family.defaultRewards.focus;
  }
  return family.defaultRewards.ordinary;
}

export function assertPositiveSunlight(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100) {
    throw new DomainError("INVALID_INPUT", "阳光数量必须是 1 至 100 的整数");
  }
}
