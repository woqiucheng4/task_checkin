import { describe, expect, it } from "vitest";
// The migration CLI deliberately stays independent of the Mini Program compilation.
import {
  digest,
  validateSnapshot,
  remapFileIds,
  collectFileIds,
  ownFilePath,
  copyApplicationFiles,
} from "../../scripts/migration-lib.mjs";

describe("migration boundary", () => {
  it("rejects foreign files and traversal before a migration reads cloud storage", () => {
    expect(ownFilePath("cloud://source.bucket/task-checkin/family/photo", "source")).toBe(
      "task-checkin/family/photo",
    );
    for (const id of [
      "cloud://source.bucket/rental/photo",
      "cloud://another.bucket/task-checkin/family/photo",
      "cloud://source.bucket/task-checkin/../rental/photo",
    ]) {
      expect(() => ownFilePath(id, "source")).toThrow();
    }
  });
  it("copies only referenced app photos and verifies destination bytes before returning a file map", async () => {
    const objects = new Map<string, Buffer>([
      ["cloud://source.bucket/task-checkin/family/a", Buffer.from("image bytes")],
    ]);
    const source = {
      async downloadFile({ fileID }: { fileID: string }) {
        return { fileContent: objects.get(fileID) };
      },
    };
    const target = {
      async uploadFile({ cloudPath, fileContent }: { cloudPath: string; fileContent: Buffer }) {
        const fileID = `cloud://target.bucket/${cloudPath}`;
        objects.set(fileID, fileContent);
        return { fileID };
      },
      async downloadFile({ fileID }: { fileID: string }) {
        return { fileContent: objects.get(fileID) };
      },
    };
    const mapping = await copyApplicationFiles(
      {
        collections: { photo: "cloud://source.bucket/task-checkin/family/a" },
        sourceEnv: "source",
      },
      source,
      target,
      "target",
    );
    expect(Object.keys(mapping)).toEqual(["cloud://source.bucket/task-checkin/family/a"]);
    expect(Object.values(mapping)[0]).toMatch(
      /^cloud:\/\/target.bucket\/task-checkin\/migrations\//,
    );
    expect(objects.size).toBe(2);
  });
  it("rejects a rental collection even in a checksum-valid snapshot", () => {
    const collections = { task_checkin_accounts: [{ _id: "a" }], rental_accounts: [{ _id: "b" }] };
    expect(() =>
      validateSnapshot(
        { application: "task_checkin", schemaVersion: 1, collections, sha256: digest(collections) },
        ["task_checkin_accounts"],
      ),
    ).toThrow();
  });
  it("detects modified documents", () => {
    const row = { _id: "a", name: "before" };
    const collections = { task_checkin_accounts: [row] };
    const snapshot = {
      application: "task_checkin",
      schemaVersion: 1,
      collections,
      sha256: digest(collections),
    };
    row.name = "after";
    expect(() => validateSnapshot(snapshot, ["task_checkin_accounts"])).toThrow();
  });
  it("preserves business ids and requires every old cloud file reference to be mapped", () => {
    const row = {
      _id: "account-a",
      childId: "child-a",
      images: ["cloud://old/file"],
      nested: { file: "cloud://old/file" },
    };
    expect([...collectFileIds(row)]).toEqual(["cloud://old/file"]);
    expect(() => remapFileIds(row, {})).toThrow();
    expect(remapFileIds(row, { "cloud://old/file": "cloud://new/file" })).toEqual({
      ...row,
      images: ["cloud://new/file"],
      nested: { file: "cloud://new/file" },
    });
  });
});
