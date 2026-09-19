import type { CoreAction } from "../../src/application/core-api.js";
import type { CommandResult } from "../../src/shared/result.js";

interface ParentClient {
  execute(
    action: CoreAction,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<CommandResult<unknown>>;
}

interface ChildTaskReference {
  readonly childLabel: string;
  readonly id: string;
}

interface ParentChildState {
  readonly id: string;
  readonly nickname: string;
  readonly tasks: readonly ChildTaskReference[];
}

export interface ParentControllerState {
  readonly notice: string;
  readonly selectedChildId: string;
  readonly taskItems: readonly ChildTaskReference[];
}

export class ParentController {
  private state: ParentControllerState;

  constructor(
    private readonly client: ParentClient,
    private readonly children: readonly ParentChildState[],
    selectedChildId: string,
  ) {
    this.state = {
      notice: "",
      selectedChildId,
      taskItems: children.find((child) => child.id === selectedChildId)?.tasks ?? [],
    };
  }

  current(): ParentControllerState {
    return structuredClone(this.state);
  }

  selectChild(childId: string): ParentControllerState {
    const child = this.children.find((item) => item.id === childId);
    if (child === undefined) return this.current();
    this.state = { notice: "", selectedChildId: child.id, taskItems: child.tasks };
    return this.current();
  }

  async confirmSunlight(assignmentId: string, displayedAmount: number): Promise<void> {
    await this.perform(
      "FAMILY_REVIEW",
      { assignmentId, decision: "APPROVE" },
      `已确认，${displayedAmount} 阳光已存入果树`,
    );
  }

  async requestRevision(assignmentId: string, note: string): Promise<void> {
    await this.perform(
      "FAMILY_REVIEW",
      { assignmentId, decision: "REVISION_REQUIRED", note },
      "已请孩子订正",
    );
  }

  async waiveSunlight(assignmentId: string, note: string): Promise<void> {
    await this.perform(
      "FAMILY_REVIEW",
      { assignmentId, decision: "WAIVE", note },
      "本次不发放阳光，任务记录仍保留",
    );
  }

  private async perform(
    action: CoreAction,
    payload: Readonly<Record<string, unknown>>,
    successNotice: string,
  ): Promise<void> {
    try {
      const result = await this.client.execute(action, {
        ...payload,
        childId: this.state.selectedChildId,
      });
      this.state = {
        ...this.state,
        notice: result.ok ? successNotice : result.error.message,
      };
    } catch {
      this.state = { ...this.state, notice: "网络开小差了，请稍后重试" };
    }
  }
}
