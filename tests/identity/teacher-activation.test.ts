import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { IdentityService } from "../../src/application/identity-service.js";
import { TeacherActivationService } from "../../src/application/teacher-activation-service.js";
import type {
  ActorContext,
  GroupType,
  OrganizationType,
  TeacherActivationCode,
} from "../../src/domain/model.js";
import { createHarness } from "../helpers/harness.js";

const platform: ActorContext = { accountId: "platform-operator", mode: "PLATFORM" };
const expiresAt = "2026-10-01T00:00:00.000Z";
const pepper = "test-only-teacher-activation-pepper";

async function setup() {
  const harness = createHarness();
  const identity = new IdentityService(harness);
  const activations = new TeacherActivationService(harness);
  const account = await identity.createAccount({
    openId: "wx-teacher",
    requestId: "account-teacher-1",
  });
  const actor: ActorContext = { accountId: account.id, mode: "ACCOUNT" };
  return { ...harness, identity, activations, actor };
}

describe("one-time teacher activation", () => {
  beforeEach(() => vi.stubEnv("TEACHER_ACTIVATION_PEPPER", pepper));
  afterEach(() => vi.unstubAllEnvs());

  it("defines restricted workspace types and stores only a hash", async () => {
    expectTypeOf<"TEACHER_WORKSPACE">().toExtend<OrganizationType>();
    expectTypeOf<"LEARNING_GROUP">().toExtend<GroupType>();
    const h = await setup();
    const issued = await h.activations.issue(platform, {
      expiresAt,
      requestId: "issue-teacher-001",
    });
    const stored = await h.repository.read("teacherActivationCodes", issued.activation.id);
    expectTypeOf(stored).toEqualTypeOf<TeacherActivationCode | undefined>();
    expect(stored).toMatchObject({
      codeHash: expect.any(String),
      expiresAt,
      status: "ACTIVE",
      issuedByAccountId: platform.accountId,
    });
    expect(stored?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(await h.repository.query("teacherActivationCodes"))).not.toContain(
      issued.code,
    );
    expect(JSON.stringify(await h.repository.query("commandReceipts"))).not.toContain(issued.code);
    expect(JSON.stringify(await h.repository.query("auditLogs"))).not.toContain(issued.code);
    expect(JSON.stringify(stored)).not.toContain(pepper);
  });

  it("creates exactly one workspace and admin membership and replays the same request", async () => {
    const h = await setup();
    const issued = await h.activations.issue(platform, {
      expiresAt,
      requestId: "issue-teacher-001",
    });
    expect(
      await h.activations.issue(platform, { expiresAt, requestId: "issue-teacher-001" }),
    ).toEqual(issued);
    const input = {
      code: issued.code,
      workspaceName: "青禾老师",
      requestId: "activate-teacher-001",
    };
    const workspace = await h.identity.activateTeacherWorkspace(h.actor, input);
    expect(workspace).toMatchObject({
      type: "TEACHER_WORKSPACE",
      name: "青禾老师",
      status: "ACTIVE",
    });
    expect(await h.identity.activateTeacherWorkspace(h.actor, input)).toEqual(workspace);
    expect(await h.repository.query("organizations")).toHaveLength(1);
    expect(await h.repository.query("organizationMembers")).toMatchObject([
      {
        accountId: h.actor.accountId,
        organizationId: workspace.id,
        organizationRole: "ORGANIZATION_ADMIN",
      },
    ]);
    expect(await h.repository.read("teacherActivationCodes", issued.activation.id)).toMatchObject({
      status: "REDEEMED",
      redeemedByAccountId: h.actor.accountId,
      redeemedAt: h.clock.now(),
    });
    expect((await h.repository.query("auditLogs")).map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "TEACHER_ACTIVATION_ISSUED",
        "TEACHER_WORKSPACE_CREATED",
        "TEACHER_ACTIVATION_REDEEMED",
      ]),
    );
    await expect(
      h.identity.activateTeacherWorkspace(h.actor, { ...input, requestId: "activate-teacher-002" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects expiry at its exact boundary, revoked codes, and unknown codes", async () => {
    const h = await setup();
    const expired = await h.activations.issue(platform, {
      expiresAt,
      requestId: "issue-expiry-001",
    });
    const revoked = await h.activations.issue(platform, {
      expiresAt,
      requestId: "issue-revoke-001",
    });
    const revokeInput = {
      activationCodeId: revoked.activation.id,
      requestId: "revoke-teacher-001",
    };
    const revocation = await h.activations.revoke(platform, revokeInput);
    expect(await h.activations.revoke(platform, revokeInput)).toEqual(revocation);
    expect(revocation).toMatchObject({ status: "REVOKED", revokedAt: h.clock.now() });
    h.clock.set(expiresAt);
    for (const code of [expired.code, revoked.code, "unknown-code"]) {
      await expect(
        h.identity.activateTeacherWorkspace(h.actor, {
          code,
          workspaceName: "老师空间",
          requestId: "activate-denied-001",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await h.repository.query("organizations")).toHaveLength(0);
    expect(
      await h.repository.query("auditLogs", { action: "TEACHER_ACTIVATION_REVOKED" }),
    ).toHaveLength(1);
  });

  it("requires platform issuance/revocation and an active adult account for redemption", async () => {
    const h = await setup();
    await expect(
      h.activations.issue(h.actor, { expiresAt, requestId: "issue-denied-001" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const issued = await h.activations.issue(platform, {
      expiresAt,
      requestId: "issue-teacher-001",
    });
    await expect(
      h.activations.revoke(h.actor, {
        activationCodeId: issued.activation.id,
        requestId: "revoke-denied-001",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const input = {
      code: issued.code,
      workspaceName: "老师空间",
      requestId: "activate-denied-001",
    };
    for (const actor of [
      platform,
      {
        ...h.actor,
        mode: "CHILD" as const,
      } as unknown as import("../../src/domain/model.js").ActorContext,
      { accountId: "missing", mode: "ACCOUNT" as const },
    ]) {
      await expect(h.identity.activateTeacherWorkspace(actor, input)).rejects.toBeDefined();
    }
    await h.repository.transaction((tx) =>
      tx.update("accounts", h.actor.accountId, { status: "INACTIVE" }),
    );
    await expect(h.identity.activateTeacherWorkspace(h.actor, input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(await h.repository.query("organizations")).toHaveLength(0);
  });

  it("fails closed without a pepper and rejects malformed inputs", async () => {
    const h = await setup();
    vi.stubEnv("TEACHER_ACTIVATION_PEPPER", "");
    await expect(
      h.activations.issue(platform, { expiresAt, requestId: "issue-config-001" }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    vi.stubEnv("TEACHER_ACTIVATION_PEPPER", pepper);
    for (const date of ["not-a-date", "2026-01-01T00:00:00.000Z"]) {
      await expect(
        h.activations.issue(platform, { expiresAt: date, requestId: "issue-invalid-001" }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(await h.repository.query("teacherActivationCodes")).toHaveLength(0);
  });

  it("does not consume on invalid workspace input or a hash mismatch", async () => {
    const h = await setup();
    const issued = await h.activations.issue(platform, {
      expiresAt,
      requestId: "issue-validation-001",
    });
    const input = { code: issued.code, workspaceName: " ", requestId: "activate-validation-001" };
    await expect(h.identity.activateTeacherWorkspace(h.actor, input)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    vi.stubEnv("TEACHER_ACTIVATION_PEPPER", "different-test-pepper");
    await expect(
      h.identity.activateTeacherWorkspace(h.actor, { ...input, workspaceName: "老师空间" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await h.repository.read("teacherActivationCodes", issued.activation.id)).toMatchObject({
      status: "ACTIVE",
    });
    expect(await h.repository.query("organizations")).toHaveLength(0);
  });

  it("issues only one code for concurrent retries and resolves revoke versus redeem atomically", async () => {
    const h = await setup();
    const issue = { expiresAt, requestId: "issue-concurrent-retry-001" };
    const [first, second] = await Promise.all([
      h.activations.issue(platform, issue),
      h.activations.issue(platform, issue),
    ]);
    expect(first).toEqual(second);
    expect(await h.repository.query("teacherActivationCodes")).toHaveLength(1);
    const results = await Promise.allSettled([
      h.activations.revoke(platform, {
        activationCodeId: first.activation.id,
        requestId: "revoke-concurrent-001",
      }),
      h.identity.activateTeacherWorkspace(h.actor, {
        code: first.code,
        workspaceName: "老师空间",
        requestId: "activate-concurrent-001",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const record = await h.repository.read("teacherActivationCodes", first.activation.id);
    expect(await h.repository.query("organizations")).toHaveLength(
      record?.status === "REDEEMED" ? 1 : 0,
    );
  });

  it("rolls back workspace, membership, redemption, and receipts together if auditing fails", async () => {
    const h = await setup();
    const issued = await h.activations.issue(platform, {
      expiresAt,
      requestId: "issue-rollback-001",
    });
    const transaction = h.repository.transaction.bind(h.repository);
    vi.spyOn(h.repository, "transaction").mockImplementationOnce((work) =>
      transaction(async (tx) => {
        vi.spyOn(tx, "appendAudit").mockRejectedValueOnce(new Error("audit unavailable"));
        return work(tx);
      }),
    );
    await expect(
      h.identity.activateTeacherWorkspace(h.actor, {
        code: issued.code,
        workspaceName: "老师空间",
        requestId: "activate-rollback-001",
      }),
    ).rejects.toThrow("audit unavailable");
    expect(await h.repository.query("organizations")).toHaveLength(0);
    expect(await h.repository.query("organizationMembers")).toHaveLength(0);
    expect(
      await h.repository.query("commandReceipts", { action: "ACTIVATE_TEACHER_WORKSPACE" }),
    ).toHaveLength(0);
    expect(await h.repository.read("teacherActivationCodes", issued.activation.id)).toMatchObject({
      status: "ACTIVE",
    });
  });

  it("allows only one concurrent consumer and replays concurrent same-request attempts", async () => {
    const h = await setup();
    const issued = await h.activations.issue(platform, {
      expiresAt,
      requestId: "issue-concurrent-001",
    });
    const other = await h.identity.createAccount({
      openId: "wx-other",
      requestId: "account-other-001",
    });
    const input = { code: issued.code, workspaceName: "老师空间", requestId: "activate-race-001" };
    const results = await Promise.allSettled([
      h.identity.activateTeacherWorkspace(h.actor, input),
      h.identity.activateTeacherWorkspace({ accountId: other.id, mode: "ACCOUNT" }, input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await h.repository.query("organizations")).toHaveLength(1);
    const second = await h.activations.issue(platform, {
      expiresAt,
      requestId: "issue-concurrent-002",
    });
    const sameInput = { ...input, code: second.code, requestId: "activate-same-race-001" };
    const replays = await Promise.all([
      h.identity.activateTeacherWorkspace(h.actor, sameInput),
      h.identity.activateTeacherWorkspace(h.actor, sameInput),
    ]);
    expect(replays[0]).toEqual(replays[1]);
    expect(await h.repository.query("organizations")).toHaveLength(2);
  });
});
