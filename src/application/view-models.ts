import type { ApplicationDependencies } from "./ports.js";
import type {
  AcademicReviewState,
  ActorContext,
  RewardState,
  Task,
  TaskInstanceState,
  TaskSource,
} from "../domain/model.js";
import { AccessPolicy } from "../domain/policy.js";
import { isLateSameDayPublication } from "../shared/time.js";

export interface ChildTaskItemView {
  readonly assignmentId: string;
  readonly title: string;
  readonly source: TaskSource;
  readonly dueAt: string;
  readonly taskState: TaskInstanceState;
  readonly academicState: AcademicReviewState;
  readonly rewardState: RewardState;
}

export interface ChildTodayView {
  readonly date: string;
  readonly mustDo: readonly ChildTaskItemView[];
  readonly familyFocus: readonly ChildTaskItemView[];
  readonly challenges: readonly ChildTaskItemView[];
  readonly upcoming: readonly ChildTaskItemView[];
  readonly lateNoticeAssignmentIds: readonly string[];
  readonly completionRequiredAssignmentIds: readonly string[];
  readonly allDone: boolean;
}

export class ViewModelService {
  private readonly policy: AccessPolicy;

  constructor(private readonly dependencies: ApplicationDependencies) {
    this.policy = new AccessPolicy(dependencies.repository);
  }

  async childToday(actor: ActorContext, date: string, childId: string): Promise<ChildTodayView> {
    await this.policy.requireChildScope(actor, childId);
    const assignments = await this.dependencies.repository.query("taskAssignments", {
      childId,
    });
    const current: { assignment: (typeof assignments)[number]; task: Task }[] = [];
    const upcoming: ChildTaskItemView[] = [];
    for (const assignment of assignments) {
      const task = await this.dependencies.repository.read("tasks", assignment.taskId);
      if (task?.status !== "PUBLISHED") {
        continue;
      }
      if (
        assignment.occurrenceDate > date ||
        (assignment.occurrenceDate === date &&
          Date.parse(task.startsAt) > Date.parse(this.dependencies.clock.now()))
      ) {
        upcoming.push(toChildTaskItem(assignment, task));
        continue;
      }
      if (assignment.occurrenceDate === date) {
        current.push({ assignment, task });
      }
    }

    const lateNoticeAssignmentIds: string[] = [];
    const completionRequiredAssignmentIds: string[] = [];
    const mustDo: ChildTaskItemView[] = [];
    const challenges: ChildTaskItemView[] = [];
    const familyFocus = current
      .filter(({ assignment }) => assignment.familyFocusRank !== undefined)
      .sort(
        (left, right) =>
          (left.assignment.familyFocusRank ?? 0) - (right.assignment.familyFocusRank ?? 0),
      )
      .map(({ assignment, task }) => toChildTaskItem(assignment, task));

    for (const { assignment, task } of current) {
      const item = toChildTaskItem(assignment, task);
      const late =
        task.importance === "REQUIRED" &&
        !assignment.acceptedLateChallenge &&
        isLateSameDayPublication({
          dueDate: assignment.occurrenceDate,
          publishedAt: task.createdAt,
        });
      if (late) {
        lateNoticeAssignmentIds.push(assignment.id);
      }
      if (task.importance === "CHALLENGE" || assignment.acceptedLateChallenge) {
        challenges.push(item);
      } else {
        mustDo.push(item);
      }
      if (
        task.importance === "REQUIRED" &&
        !late &&
        !["EXCUSED", "CANCELLED"].includes(assignment.taskState)
      ) {
        completionRequiredAssignmentIds.push(assignment.id);
      }
    }

    const requiredStates = current
      .filter(({ assignment }) => completionRequiredAssignmentIds.includes(assignment.id))
      .map(({ assignment }) => assignment.taskState);
    const allDone = requiredStates.every((state) =>
      ["SUBMITTED", "COMPLETED", "EXCUSED", "CANCELLED"].includes(state),
    );

    return {
      allDone,
      challenges,
      completionRequiredAssignmentIds,
      date,
      familyFocus,
      lateNoticeAssignmentIds,
      mustDo,
      upcoming,
    };
  }
}

function toChildTaskItem(
  assignment: {
    readonly id: string;
    readonly taskState: TaskInstanceState;
    readonly academicState: AcademicReviewState;
    readonly rewardState: RewardState;
  },
  task: Task,
): ChildTaskItemView {
  return {
    academicState: assignment.academicState,
    assignmentId: assignment.id,
    dueAt: task.dueAt,
    rewardState: assignment.rewardState,
    source: task.source,
    taskState: assignment.taskState,
    title: task.title,
  };
}
