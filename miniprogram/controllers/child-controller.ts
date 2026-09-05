import type { CoreAction } from "../../src/application/core-api.js";
import type { CommandResult } from "../../src/shared/result.js";

export interface ChildCommandClient {
  execute(
    action: CoreAction,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<CommandResult<unknown>>;
}

export interface ChildControllerState {
  readonly notice: string;
  readonly status: "idle" | "working" | "success" | "error";
}

export interface ChildSubmissionInput {
  readonly assignmentId: string;
  readonly mediaAssetIds?: readonly string[];
  readonly mode: "CONFIRM" | "TEXT" | "PHOTO" | "TEXT_AND_PHOTO";
  readonly text?: string;
}

export class ChildController {
  private state: ChildControllerState = { notice: "", status: "idle" };

  constructor(private readonly client: ChildCommandClient) {}

  current(): ChildControllerState {
    return structuredClone(this.state);
  }

  async submit(input: ChildSubmissionInput): Promise<void> {
    await this.perform(
      "SUBMIT_TASK",
      {
        assignmentId: input.assignmentId,
        ...(input.mediaAssetIds === undefined ? {} : { mediaAssetIds: input.mediaAssetIds }),
        mode: input.mode,
        ...(input.text === undefined ? {} : { text: input.text }),
      },
      "已提交，阳光已保护",
    );
  }

  async supplement(input: ChildSubmissionInput): Promise<void> {
    await this.perform(
      "SUPPLEMENT_SUBMISSION",
      {
        assignmentId: input.assignmentId,
        ...(input.mediaAssetIds === undefined ? {} : { mediaAssetIds: input.mediaAssetIds }),
        mode: input.mode,
        ...(input.text === undefined ? {} : { text: input.text }),
      },
      "已重新提交，阳光继续保护",
    );
  }

  async harvest(treeId: string): Promise<void> {
    await this.perform("HARVEST_TREE", { treeId }, "采摘成功，去选择下一棵果树吧");
  }

  async startTree(fruitTypeId: string, name: string): Promise<void> {
    await this.perform("START_TREE", { fruitTypeId, name }, "新果树已经种下");
  }

  private async perform(
    action: CoreAction,
    payload: Readonly<Record<string, unknown>>,
    successNotice: string,
  ): Promise<void> {
    this.state = { notice: "正在处理…", status: "working" };
    try {
      const result = await this.client.execute(action, payload);
      this.state = result.ok
        ? { notice: successNotice, status: "success" }
        : { notice: result.error.message, status: "error" };
    } catch {
      this.state = { notice: "网络开小差了，请稍后重试", status: "error" };
    }
  }
}
