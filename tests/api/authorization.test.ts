import { describe, expect, it } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { MvpPolicy } from "../../src/application/mvp-policy.js";
import { createCloudFunctionHandler } from "../../cloudfunctions/coreApi/handler.js";
import { IdentityService } from "../../src/application/identity-service.js";
import { createHarness } from "../helpers/harness.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

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

  it("enforces the MVP policy only after resolving the trusted actor", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    await identity.createAccount({ openId: "wx-mvp-guardian", requestId: "seed-mvp-guardian" });
    const api = createCoreApi({ ...harness, mvpPolicy: new MvpPolicy({ enabled: true }) });

    const result = await api.handle(
      {
        action: "GET_PLATFORM_DASHBOARD",
        actor: { mode: "PLATFORM" },
        payload: {},
      },
      { openId: "wx-mvp-guardian" },
    );

    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
  });

  it("rejects a disabled action after resolving an authenticated actor", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    await identity.createAccount({ openId: "wx-mvp-account", requestId: "seed-mvp-account" });
    const api = createCoreApi({ ...harness, mvpPolicy: new MvpPolicy({ enabled: true }) });

    const result = await api.handle(
      { action: "GET_PLATFORM_DASHBOARD", payload: {} },
      { openId: "wx-mvp-account" },
    );

    expect(result).toMatchObject({ error: { code: "FEATURE_DISABLED" }, ok: false });
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
      () => ({ APPID: "checkin-app", OPENID: "trusted-runtime-openid" }),
      () => false,
      (appId) => appId === "checkin-app",
    );

    await handler({ action: "CREATE_FAMILY", openId: "attacker-openid", payload: {} }, {});

    expect(capturedOpenId).toBe("trusted-runtime-openid");
  });

  it("rejects a shared-environment request from an unapproved source app", async () => {
    let invoked = false;
    const handler = createCloudFunctionHandler(
      {
        handle: async () => {
          invoked = true;
          return { data: { accepted: true }, ok: true };
        },
      },
      () => ({
        APPID: "resource-owner-appid",
        FROM_APPID: "unapproved-consumer-appid",
        FROM_OPENID: "consumer-openid",
        OPENID: "trusted-runtime-openid",
      }),
      () => false,
      (appId) => appId === "wx7f63176424216ee8",
    );

    const result = await handler({ action: "CREATE_FAMILY", payload: {} }, {});

    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
    expect(invoked).toBe(false);
  });

  it("routes a parent dashboard read through the authenticated guardian account", async () => {
    const seed = await createIdentityScenario(1);
    const api = createCoreApi(seed.harness);

    const result = await api.handle(
      {
        action: "GET_PARENT_DASHBOARD",
        payload: { childId: seed.firstChild.id, date: "2026-09-05" },
      },
      { openId: "wx-scenario-guardian" },
    );

    expect(result).toMatchObject({
      data: { selectedChild: { id: seed.firstChild.id, nickname: "孩子1" } },
      ok: true,
    });
  });
});
