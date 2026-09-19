import { describe, expect, it, vi } from "vitest";
import { createCloudFunctionHandler } from "../../cloudfunctions/coreApi/handler.js";
import { COLLECTIONS } from "../../src/infrastructure/collections.js";
import {
  COLLECTIONS as repositoryCollections,
  CloudBaseRepository,
} from "../../src/infrastructure/cloudbase-repository.js";

describe("independent checkin application boundary", () => {
  it("fails closed with no source policy even if runtime identity is valid", async () => {
    const handle = vi.fn();
    const handler = createCloudFunctionHandler({ handle }, () => ({
      APPID: "checkin",
      OPENID: "user",
    }));
    expect(await handler({}, {})).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(handle).not.toHaveBeenCalled();
  });

  it("uses the consumer identity as a matched pair and ignores payload identity", async () => {
    const handle = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const handler = createCloudFunctionHandler(
      { handle },
      () => ({
        APPID: "rental",
        OPENID: "rental-user",
        FROM_APPID: "checkin",
        FROM_OPENID: "checkin-user",
      }),
      () => false,
      (id) => id === "checkin",
    );
    await handler({ openId: "forged", appId: "rental" }, {});
    expect(handle).toHaveBeenCalledWith(expect.anything(), { openId: "checkin-user" });
  });

  it.each([
    { APPID: "rental", OPENID: "rental-user", FROM_APPID: "checkin" },
    { APPID: "checkin", OPENID: "rental-user", FROM_OPENID: "checkin-user" },
    { APPID: "rental", OPENID: "user" },
    { APPID: "checkin", OPENID: "" },
  ])("rejects incomplete or foreign runtime identities %j", async (runtime) => {
    const handle = vi.fn();
    const handler = createCloudFunctionHandler(
      { handle },
      () => runtime,
      () => false,
      (id) => id === "checkin",
    );
    expect(await handler({ APPID: "checkin", OPENID: "forged" }, {})).toMatchObject({ ok: false });
    expect(handle).not.toHaveBeenCalled();
  });

  it("routes every logical collection read into the exclusive resource manifest", async () => {
    expect(repositoryCollections).toBe(COLLECTIONS);
    const names: string[] = [];
    const collection = (name: string) => {
      names.push(name);
      return { doc: () => ({ get: async () => ({ data: undefined }) }) };
    };
    const repository = new CloudBaseRepository({ collection } as never);
    for (const name of Object.keys(COLLECTIONS))
      await repository.read(name as keyof typeof COLLECTIONS, "id");
    expect(names).toHaveLength(43);
    expect(new Set(names).size).toBe(43);
    expect(names.every((name) => name.startsWith("task_checkin_"))).toBe(true);
    expect(names).not.toContain("accounts");
    expect(names).not.toContain("tasks");
  });
});
