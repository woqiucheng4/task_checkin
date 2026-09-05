import type { CoreAction } from "../../src/application/core-api.js";
import type { CommandResult } from "../../src/shared/result.js";

interface TeacherClient {
  execute(
    action: CoreAction,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<CommandResult<unknown>>;
}

export class TeacherController {
  private notice = "";

  constructor(private readonly client: TeacherClient) {}

  current(): { readonly notice: string } {
    return { notice: this.notice };
  }

  async approve(assignmentId: string, note: string): Promise<void> {
    await this.review(assignmentId, "APPROVE", note, "学习评价已通过，等待家庭确认阳光");
  }

  async requestRevision(assignmentId: string, note: string): Promise<void> {
    await this.review(assignmentId, "REVISION_REQUIRED", note, "订正要求已发送给孩子");
  }

  async excuse(assignmentId: string, note: string): Promise<void> {
    await this.review(assignmentId, "EXCUSE", note, "已标记为学习免除");
  }

  private async review(
    assignmentId: string,
    decision: "APPROVE" | "REVISION_REQUIRED" | "EXCUSE",
    note: string,
    successNotice: string,
  ): Promise<void> {
    try {
      const result = await this.client.execute("ACADEMIC_REVIEW", {
        assignmentId,
        decision,
        ...(note.trim().length === 0 ? {} : { note }),
      });
      this.notice = result.ok ? successNotice : result.error.message;
    } catch {
      this.notice = "网络开小差了，请稍后重试";
    }
  }
}
