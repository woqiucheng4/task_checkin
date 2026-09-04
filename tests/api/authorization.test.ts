import { describe, expect, it } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { createCloudFunctionHandler } from "../../cloudfunctions/coreApi/handler.js";
import { IdentityService } from "../../src/application/identity-service.js";
import { createHarness } from "../helpers/harness.js";

describe("core API authentication", () => {
  it("ignores payload openId and authenticates from trusted context", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    const trusted = await identity.createAccount({
      openId: "trusted-openid",
      requestId: "seed-trusted-account",
    });
    const attacker = await identity.createAccount({
      openId: "attacker-openid",
      requestId: "seed-attacker-account",
    });
    const api = createCoreApi(harness);

    const result = await api.handle(
      {
        action: "CREATE_FAMILY",
        payload: { name: "可信家庭", openId: "attacker-openid" },
        requestId: "request-trusted-family-001",
      },
      { openId: "trusted-openid" },
    );

    expect(result.ok).toBe(true);
    const membership = (await harness.repository.query("familyMembers"))[0];
    expect(membership?.accountId).toBe(trusted.id);
    expect(membership?.accountId).not.toBe(attacker.id);
  });

  it("validates a selected child against an active guardian link", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    await identity.createAccount({ openId: "wx-outsider", requestId: "seed-outsider-account" });
    const api = createCoreApi(harness);

    const result = await api.handle(
      {
        action: "GET_CHILD_TODAY",
        actor: { childId: "child-not-linked", mode: "CHILD" },
        payload: { date: "2026-09-05" },
      },
      { openId: "wx-outsider" },
    );

    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
  });

  it("does not grant platform mode from an event payload", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    await identity.createAccount({ openId: "wx-normal", requestId: "seed-normal-account" });
    const api = createCoreApi(harness);

    const result = await api.handle(
      {
        action: "CREATE_ORGANIZATION",
        actor: { mode: "PLATFORM" },
        payload: {
          adminAccountId: "someone",
          name: "伪造机构",
          type: "SCHOOL",
        },
        requestId: "request-forged-platform-001",
      },
      { openId: "wx-normal" },
    );

    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
  });

  it("passes only runtime OPENID into the core API", async () => {
    let capturedOpenId = "";
    const handler = createCloudFunctionHandler(
      {
        handle: async (_command, auth) => {
          capturedOpenId = auth.openId;
          return { data: { accepted: true }, ok: true };
        },
      },
      () => ({ OPENID: "trusted-runtime-openid" }),
    );

    await handler({ action: "CREATE_FAMILY", openId: "attacker-openid", payload: {} }, {});

    expect(capturedOpenId).toBe("trusted-runtime-openid");
  });
});
