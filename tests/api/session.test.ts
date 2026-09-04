import { describe, expect, it } from "vitest";
import { SessionStore } from "../../miniprogram/store/session.js";

describe("local navigation session", () => {
  it("clears a stale child selection when switching workspaces", () => {
    const session = new SessionStore();
    session.selectWorkspace({ id: "family-1", kind: "FAMILY" });
    session.selectRoleMode("CHILD");
    session.selectChild("child-1");

    session.selectWorkspace({ id: "org-1", kind: "ORGANIZATION" });

    expect(session.current().childId).toBeUndefined();
    expect(session.current().roleMode).toBe("ACCOUNT");
  });

  it("persists navigation preferences but marks them as untrusted", () => {
    const persistence = new MemoryPersistence();
    const first = new SessionStore(persistence);
    first.selectWorkspace({ id: "family-1", kind: "FAMILY" });
    first.selectRoleMode("CHILD");
    first.selectChild("child-1");

    const restored = new SessionStore(persistence).current();

    expect(restored).toMatchObject({
      authorizationProof: false,
      childId: "child-1",
      roleMode: "CHILD",
      workspace: { id: "family-1", kind: "FAMILY" },
    });
  });

  it("returns snapshots that cannot mutate the store", () => {
    const session = new SessionStore();
    session.selectWorkspace({ id: "family-1", kind: "FAMILY" });
    const snapshot = session.current() as { workspace?: { id: string } };
    if (snapshot.workspace !== undefined) {
      snapshot.workspace.id = "tampered";
    }

    expect(session.current().workspace?.id).toBe("family-1");
  });
});

class MemoryPersistence {
  private value: unknown;

  load(): unknown {
    return structuredClone(this.value);
  }

  save(value: unknown): void {
    this.value = structuredClone(value);
  }
}
