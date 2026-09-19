import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AccountChildApiClient,
  CoreApiClient,
  withRequiredChildId,
} from "../../miniprogram/services/core-api.js";

describe("mini-program core API client", () => {
  it("has a valid placeholder page while the visual UI remains replaceable", () => {
    const root = resolve(import.meta.dirname, "../..");
    const manifest = JSON.parse(readFileSync(resolve(root, "miniprogram/app.json"), "utf8")) as {
      pages?: string[];
    };
    const firstPage = manifest.pages?.[0];

    expect(firstPage).toBe("pages/bootstrap/index");
    for (const extension of ["ts", "json", "wxml", "wxss"]) {
      expect(existsSync(resolve(root, `miniprogram/${firstPage}.${extension}`))).toBe(true);
    }
  });

  it("generates a request id and never sends caller openId", async () => {
    const cloud = new FakeCloudCaller();
    const client = new CoreApiClient(cloud, () => "request-generated-0001");

    await client.execute("CREATE_FAMILY", { name: "晨光家", openId: "must-not-leave-client" });

    expect(cloud.lastPayload).toMatchObject({
      action: "CREATE_FAMILY",
      payload: { name: "晨光家" },
      requestId: "request-generated-0001",
    });
    expect(cloud.lastPayload).not.toHaveProperty("openId");
    expect((cloud.lastPayload.payload as Record<string, unknown>).openId).toBeUndefined();
  });

  it("passes only navigation actor selection rather than authorization claims", async () => {
    const cloud = new FakeCloudCaller();
    const client = new CoreApiClient(cloud, () => "request-generated-0002");

    await client.execute(
      "GET_CHILD_TODAY",
      { date: "2026-09-05", childId: "child-1" },
      { mode: "ACCOUNT" },
    );

    expect(cloud.lastPayload).toEqual({
      action: "GET_CHILD_TODAY",
      actor: { mode: "ACCOUNT" },
      payload: { childId: "child-1", date: "2026-09-05" },
      requestId: "request-generated-0002",
    });
  });

  it("attaches an explicit child resource to account-scoped requests", async () => {
    const cloud = new FakeCloudCaller();
    const client = new AccountChildApiClient(
      new CoreApiClient(cloud, () => "request-generated-child-0001"),
    );

    await client.execute("GET_CHILD_TODAY", "child-1", { date: "2026-09-19" });

    expect(cloud.lastPayload).toEqual({
      action: "GET_CHILD_TODAY",
      actor: { mode: "ACCOUNT" },
      payload: { childId: "child-1", date: "2026-09-19" },
      requestId: "request-generated-child-0001",
    });
  });

  it("requires a non-empty child resource instead of reading authority from local state", () => {
    expect(() => withRequiredChildId("  ", { date: "2026-09-19" })).toThrow(
      "请选择孩子",
    );
  });

  it("returns the client-safe result from the cloud function", async () => {
    const cloud = new FakeCloudCaller({ result: { data: { id: "family-1" }, ok: true } });
    const client = new CoreApiClient(cloud, () => "request-generated-0003");

    await expect(client.execute("CREATE_FAMILY", { name: "晨光家" })).resolves.toEqual({
      data: { id: "family-1" },
      ok: true,
    });
  });
});

class FakeCloudCaller {
  lastPayload: Readonly<Record<string, unknown>> = {};

  constructor(
    private readonly response: { readonly result?: unknown } = { result: { data: {}, ok: true } },
  ) {}

  async callFunction(input: {
    readonly name: string;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly result?: unknown }> {
    expect(input.name).toBe("taskCheckinCoreApi");
    this.lastPayload = structuredClone(input.data);
    return this.response;
  }
}
