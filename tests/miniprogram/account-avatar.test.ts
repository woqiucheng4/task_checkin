import { afterEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ command: vi.fn() }));

vi.mock("../../miniprogram/services/session-runtime.js", () => ({ command: session.command }));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  session.command.mockReset();
});

it("downloads a WeChat profile avatar URL before reading and uploading it", async () => {
  const downloadFile = vi
    .fn()
    .mockResolvedValue({ statusCode: 200, tempFilePath: "wxfile://avatar.png" });
  const readFileSync = vi.fn().mockReturnValue("iVBORw0KGgo=");
  vi.stubGlobal("wx", { downloadFile, getFileSystemManager: () => ({ readFileSync }) });
  session.command
    .mockResolvedValueOnce({ asset: { id: "avatar-1" } })
    .mockResolvedValueOnce({ id: "avatar-1", status: "ACTIVE" });

  const { uploadAccountAvatar } = await import(
    "../../miniprogram/services/upload-account-avatar.js"
  );

  await expect(uploadAccountAvatar("https://wx.qlogo.cn/avatar.png")).resolves.toBe("avatar-1");
  expect(downloadFile).toHaveBeenCalledWith({ url: "https://wx.qlogo.cn/avatar.png" });
  expect(readFileSync).toHaveBeenCalledWith("wxfile://avatar.png", "base64");
});
