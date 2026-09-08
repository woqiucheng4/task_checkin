import { describe, expect, it } from "vitest";
import { CloudMediaStorage } from "../../src/infrastructure/cloud-media-storage.js";

describe("CloudMediaStorage", () => {
  it("passes verified bytes to the exclusive path and returns the cloud file identifier", async () => {
    const uploads: unknown[] = [];
    const storage = new CloudMediaStorage({
      async uploadFile(input) {
        uploads.push(input);
        return { fileID: "cloud://env/task-checkin/family/a" };
      },
      async deleteFile() {
        throw new Error("unexpected deletion");
      },
    });
    expect(await storage.upload("task-checkin/family/a", new Uint8Array([1, 2]))).toBe(
      "cloud://env/task-checkin/family/a",
    );
    expect(uploads).toEqual([
      { cloudPath: "task-checkin/family/a", fileContent: Buffer.from([1, 2]) },
    ]);
  });
  it("refuses foreign or traversal paths before contacting storage", async () => {
    const storage = new CloudMediaStorage({
      async uploadFile() {
        throw new Error("external call forbidden");
      },
      async deleteFile() {
        throw new Error("external call forbidden");
      },
    });
    for (const path of ["rental/photo.jpg", "task-checkin/../rental.jpg", "task-checkin//x"]) {
      await expect(storage.upload(path, new Uint8Array())).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(storage.delete("cloud://env/rental/photo.jpg")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
