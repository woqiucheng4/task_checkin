import { describe, expect, it } from "vitest";
import { MvpPolicy } from "../../src/application/mvp-policy.js";
import type { ActorContext } from "../../src/domain/model.js";

const guardian: ActorContext = { accountId: "guardian-1", mode: "ACCOUNT" };
const child: ActorContext = {
  accountId: "guardian-1",
  childId: "child-1",
  mode: "CHILD",
};

describe("MvpPolicy", () => {
  const policy = new MvpPolicy({ enabled: true });

  it("rejects hidden platform actions at the service boundary", () => {
    expect(() => policy.assertAllowed("GET_PLATFORM_DASHBOARD", guardian)).toThrowError(
      expect.objectContaining({ code: "FEATURE_DISABLED" }),
    );
  });

  it("allows family task publication for an authenticated adult", () => {
    expect(() => policy.assertAllowed("PUBLISH_FAMILY_TASK", guardian)).not.toThrow();
  });

  it("rejects hidden wish actions at the service boundary", () => {
    expect(() => policy.assertAllowed("CREATE_WISH", guardian)).toThrowError(
      expect.objectContaining({ code: "FEATURE_DISABLED" }),
    );
  });

  it("rejects parent-only actions from a resolved child actor", () => {
    expect(() => policy.assertAllowed("PUBLISH_FAMILY_TASK", child)).toThrowError(
      expect.objectContaining({ code: "FEATURE_DISABLED" }),
    );
  });

  it("leaves legacy actions available when the MVP edition is disabled", () => {
    const legacyPolicy = new MvpPolicy({ enabled: false });

    expect(() => legacyPolicy.assertAllowed("GET_PLATFORM_DASHBOARD", guardian)).not.toThrow();
  });
});
