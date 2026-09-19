import { describe, expect, it, vi } from "vitest";

import { DeepSeekTaskDraftProvider } from "../../src/infrastructure/deepseek-task-draft-provider.js";

const draftJson = JSON.stringify({
  title: "完成数学练习",
  description: "第 12 页",
  category: "MATHEMATICS",
  startsAt: "2026-09-19T08:00:00.000Z",
  dueAt: "2026-09-19T18:00:00.000Z",
  submissionMode: "PHOTO",
  confidence: 0.91,
});

describe("DeepSeekTaskDraftProvider", () => {
  it("sends private image bytes to the fixed completion endpoint and normalizes strict JSON", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: draftJson } }] }), { status: 200 }),
    );
    const provider = new DeepSeekTaskDraftProvider({ apiKey: "test-key", fetch });

    await expect(
      provider.generateTaskDraft({
        image: new Uint8Array([255, 216, 255, 217]),
        mimeType: "image/jpeg",
        requestId: "ai-draft-001",
      }),
    ).resolves.toEqual({
      title: "完成数学练习",
      description: "第 12 页",
      category: "MATHEMATICS",
      startsAt: "2026-09-19T08:00:00.000Z",
      dueAt: "2026-09-19T18:00:00.000Z",
      submissionMode: "PHOTO",
      confidence: 0.91,
      provider: "deepseek",
      providerVersion: "deepseek-flash",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it.each([
    ["an HTTP failure", async () => new Response("provider detail", { status: 500 })],
    ["markdown-wrapped output", async () => new Response(JSON.stringify({ choices: [{ message: { content: "```json\\n{}\\n```" } }] }))],
  ])("maps %s to a manual-entry conflict without exposing provider details", async (_name, response) => {
    const provider = new DeepSeekTaskDraftProvider({ apiKey: "test-key", fetch: vi.fn(response) });

    await expect(
      provider.generateTaskDraft({
        image: new Uint8Array([1]),
        mimeType: "image/png",
        requestId: "ai-draft-002",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "图片暂时无法生成任务草稿，请手动填写",
    });
  });

  it("rejects a custom base URL that could redirect requests away from DeepSeek", () => {
    expect(
      () => new DeepSeekTaskDraftProvider({ apiKey: "test-key", baseUrl: "https://internal.example" }),
    ).toThrow("DEEPSEEK_BASE_URL");
  });
});
