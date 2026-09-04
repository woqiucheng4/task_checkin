import { describe, expect, it } from "vitest";
import { CORE_ACTIONS, CORE_READ_ACTIONS, createCoreApi } from "../../src/application/core-api.js";
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

  it("requires requestId for every state-changing public action", async () => {
    const api = createCoreApi(createHarness());
    const readActions = new Set<string>(CORE_READ_ACTIONS);

    for (const action of CORE_ACTIONS) {
      if (readActions.has(action)) {
        continue;
      }
      const result = await api.handle({ action, payload: {} }, { openId: "wx-write-matrix" });
      expect(result, action).toMatchObject({
        error: { code: "INVALID_COMMAND", message: expect.stringMatching(/requestId/) },
        ok: false,
      });
    }
  });

  it("routes every allowlisted action to a service boundary", async () => {
    const harness = createHarness();
    const api = createCoreApi(harness);
    await api.handle(
      { action: "BOOTSTRAP_ACCOUNT", payload: {}, requestId: "request-route-bootstrap" },
      { openId: "wx-route-matrix" },
    );

    for (const [index, action] of CORE_ACTIONS.entries()) {
      if (action === "BOOTSTRAP_ACCOUNT") {
        continue;
      }
      const result = await api.handle(
        { action, payload: {}, requestId: `request-route-${String(index).padStart(3, "0")}` },
        { openId: "wx-route-matrix" },
      );
      expect(result, action).toHaveProperty("ok");
      if (!result.ok) {
        expect(result.error.message, action).not.toMatch(/允许列表/);
      }
    }
  });
});
