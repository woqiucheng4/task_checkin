import { afterEach, describe, expect, it, vi } from "vitest";
import { CORE_ACTIONS, CORE_READ_ACTIONS, createCoreApi } from "../../src/application/core-api.js";
import { MvpPolicy } from "../../src/application/mvp-policy.js";
import { createHarness } from "../helpers/harness.js";

describe("core API contracts", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("routes teacher activation in MVP mode, uses trusted platform auth, and keeps receipts secret-free", async () => {
    vi.stubEnv("TEACHER_ACTIVATION_PEPPER", "test-only-api-teacher-pepper");
    const harness = createHarness();
    const api = createCoreApi({ ...harness, mvpPolicy: new MvpPolicy({ enabled: true }) });
    const platformAuth = { openId: "wx-platform", isPlatformOperator: true };
    const teacherAuth = { openId: "wx-teacher" };
    for (const auth of [platformAuth, teacherAuth]) {
      await api.handle(
        { action: "BOOTSTRAP_ACCOUNT", payload: {}, requestId: "bootstrap-activation-001" },
        auth,
      );
    }
    const issue = {
      action: "ISSUE_TEACHER_ACTIVATION",
      actor: { mode: "PLATFORM" },
      payload: { expiresAt: "2026-10-01T00:00:00.000Z" },
      requestId: "issue-api-teacher-001",
    };
    const issued = await api.handle(issue, platformAuth);
    expect(issued).toMatchObject({
      ok: true,
      data: { code: expect.any(String), activation: { status: "ACTIVE" } },
    });
    if (!issued.ok) throw new Error("issuance failed");
    const data = issued.data as { code: string; activation: { id: string } };
    expect(await api.handle(issue, platformAuth)).toEqual(issued);

    // Neither the event payload nor actor selection can manufacture the trusted runtime flag.
    for (const command of [
      {
        ...issue,
        isPlatformOperator: true,
        payload: {
          ...issue.payload,
          isPlatformOperator: true,
          mode: "PLATFORM",
          accountId: "platform-operator",
        },
      },
      { ...issue, actor: { mode: "ACCOUNT" } },
    ]) {
      expect(await api.handle(command, { openId: platformAuth.openId })).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
    }
    expect(await api.handle(issue, teacherAuth)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    const activate = {
      action: "ACTIVATE_TEACHER_WORKSPACE",
      payload: {
        code: data.code,
        workspaceName: "青禾老师",
        accountId: "forged-account",
        type: "SCHOOL",
        organizationRole: "STAFF",
      },
      requestId: "activate-api-teacher-001",
    };
    const [first, replay] = await Promise.all([
      api.handle(activate, teacherAuth),
      api.handle(activate, teacherAuth),
    ]);
    expect(first).toMatchObject({ ok: true, data: { type: "TEACHER_WORKSPACE" } });
    expect(replay).toEqual(first);
    const teacher = (await harness.repository.query("accounts", { openId: teacherAuth.openId }))[0];
    expect(await harness.repository.query("organizationMembers")).toMatchObject([
      { accountId: teacher?.id, organizationRole: "ORGANIZATION_ADMIN" },
    ]);
    expect(await harness.repository.query("organizations")).toHaveLength(1);
    expect(
      await api.handle({ ...activate, requestId: "activate-api-teacher-002" }, teacherAuth),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const revoke = {
      action: "REVOKE_TEACHER_ACTIVATION",
      actor: { mode: "PLATFORM" },
      payload: { activationCodeId: data.activation.id },
      requestId: "revoke-api-teacher-001",
    };
    expect(await api.handle(revoke, teacherAuth)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await api.handle(revoke, platformAuth)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(
      await harness.repository.query("commandReceipts", { action: "ISSUE_TEACHER_ACTIVATION" }),
    ).toHaveLength(1);
    expect(
      await harness.repository.query("commandReceipts", { action: "ACTIVATE_TEACHER_WORKSPACE" }),
    ).toHaveLength(1);
    for (const collection of ["commandReceipts", "auditLogs", "teacherActivationCodes"] as const) {
      expect(JSON.stringify(await harness.repository.query(collection))).not.toContain(data.code);
    }

    const another = await api.handle(
      { ...issue, requestId: "issue-api-teacher-002" },
      platformAuth,
    );
    if (!another.ok) throw new Error("issuance failed");
    const next = another.data as { code: string; activation: { id: string } };
    const revokeNext = {
      ...revoke,
      payload: { activationCodeId: next.activation.id },
      requestId: "revoke-api-teacher-002",
    };
    const revoked = await api.handle(revokeNext, platformAuth);
    expect(revoked).toMatchObject({ ok: true, data: { status: "REVOKED" } });
    expect(await api.handle(revokeNext, platformAuth)).toEqual(revoked);
    expect(
      await api.handle(
        {
          ...activate,
          payload: { ...activate.payload, code: next.code },
          requestId: "activate-api-revoked-001",
        },
        teacherAuth,
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("does not permit cross-action request-id reuse in activation transactions", async () => {
    vi.stubEnv("TEACHER_ACTIVATION_PEPPER", "test-only-api-teacher-pepper");
    const api = createCoreApi(createHarness());
    const auth = { openId: "wx-platform", isPlatformOperator: true };
    const requestId = "shared-request-activation-001";
    await api.handle({ action: "BOOTSTRAP_ACCOUNT", payload: {}, requestId }, auth);
    expect(
      await api.handle(
        {
          action: "ISSUE_TEACHER_ACTIVATION",
          actor: { mode: "PLATFORM" },
          payload: { expiresAt: "2026-10-01T00:00:00.000Z" },
          requestId,
        },
        auth,
      ),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

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
