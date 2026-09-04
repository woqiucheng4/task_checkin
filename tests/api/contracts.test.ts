import { describe, expect, it } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { createHarness } from "../helpers/harness.js";

describe("core API contracts", () => {
  it("rejects a write command without requestId before invoking a service", async () => {
    const harness = createHarness();
    const api = createCoreApi(harness);

    await expect(
      api.handle({ action: "CREATE_FAMILY", payload: { name: "晨光家" } }, { openId: "wx-1" }),
    ).resolves.toEqual({
      error: { code: "INVALID_COMMAND", message: expect.any(String) },
      ok: false,
    });
    await expect(harness.repository.query("families")).resolves.toHaveLength(0);
  });

  it("rejects actions outside the server allowlist", async () => {
    const api = createCoreApi(createHarness());
    await expect(
      api.handle(
        { action: "READ_ARBITRARY_COLLECTION", payload: {}, requestId: "request-unknown-001" },
        { openId: "wx-1" },
      ),
    ).resolves.toMatchObject({ error: { code: "INVALID_COMMAND" }, ok: false });
  });

  it("replays the first result for a repeated write request", async () => {
    const harness = createHarness();
    const api = createCoreApi(harness);
    await api.handle(
      { action: "BOOTSTRAP_ACCOUNT", payload: {}, requestId: "request-account-001" },
      { openId: "wx-replay" },
    );
    const command = {
      action: "CREATE_FAMILY",
      payload: { name: "晨光家" },
      requestId: "request-family-replay-001",
    };

    const first = await api.handle(command, { openId: "wx-replay" });
    const second = await api.handle(command, { openId: "wx-replay" });

    expect(second).toEqual(first);
    await expect(harness.repository.query("families")).resolves.toHaveLength(1);
    await expect(harness.repository.query("commandReceipts")).resolves.toHaveLength(2);
  });
});
