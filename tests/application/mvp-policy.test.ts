import { describe, expect, it } from "vitest";
import { MvpPolicy } from "../../src/application/mvp-policy.js";
import type { ActorContext } from "../../src/domain/model.js";

const guardian: ActorContext = { accountId: "guardian-1", mode: "ACCOUNT" };
const child: ActorContext = {
  accountId: "guardian-1",
  childId: "child-1",
  mode: "CHILD",
} as unknown as import("../../src/domain/model.js").ActorContext;

describe("MvpPolicy", () => {
  const policy = new MvpPolicy({ enabled: true });

  it("rejects hidden platform actions at the service boundary", () => {
    expect(() => policy.assertAllowed("GET_PLATFORM_DASHBOARD", guardian)).toThrowError(
      expect.objectContaining({ code: "FEATURE_DISABLED" }),
    );
  });

  it("allows family task publication for an authenticated account actor", () => {
    expect(() => policy.assertAllowed("PUBLISH_FAMILY_TASK", guardian)).not.toThrow();
  });

  it("allows child-scoped work from an authenticated account actor", () => {
    expect(() => policy.assertAllowed("GET_CHILD_TODAY", guardian)).not.toThrow();
  });

  it("rejects hidden wish actions at the service boundary", () => {
    expect(() => policy.assertAllowed("CREATE_WISH", guardian)).toThrowError(
      expect.objectContaining({ code: "FEATURE_DISABLED" }),
    );
  });

  it("rejects hidden advanced group-tree actions at the service boundary", () => {
    expect(() => policy.assertAllowed("START_GROUP_TREE", guardian)).toThrowError(
      expect.objectContaining({ code: "FEATURE_DISABLED" }),
    );
  });

  it("rejects child-mode actors instead of feature-gating a child view", () => {
    expect(() => policy.assertAllowed("PUBLISH_FAMILY_TASK", child)).toThrowError(
      expect.objectContaining({ code: "INVALID_COMMAND" }),
    );
  });

  it("rejects child-mode actors for the account shell", () => {
    expect(() => policy.assertAllowed("GET_ACCOUNT_SHELL", child)).toThrowError(
      expect.objectContaining({ code: "INVALID_COMMAND" }),
    );
  });

  it("rejects child-mode actors when the MVP feature gate is disabled", () => {
    const legacyPolicy = new MvpPolicy({ enabled: false });

    expect(() => legacyPolicy.assertAllowed("GET_CHILD_TODAY", child)).toThrowError(
      expect.objectContaining({ code: "INVALID_COMMAND" }),
    );
  });

  it("leaves legacy actions available when the MVP edition is disabled", () => {
    const legacyPolicy = new MvpPolicy({ enabled: false });

    expect(() => legacyPolicy.assertAllowed("GET_PLATFORM_DASHBOARD", guardian)).not.toThrow();
  });
});
