import { describe, expect, it } from "vitest";
import { SessionStore } from "../../miniprogram/store/session.js";

describe("local navigation session", () => {
  it("has no child selection when the account has no linked children", () => {
    const session = new SessionStore();

    session.reconcileChildren([]);

    expect(session.current().selectedChildId).toBeUndefined();
  });

  it("selects the sole linked child as the deterministic single option", () => {
    const session = new SessionStore();

    session.reconcileChildren(["child-1"]);

    expect(session.current()).toMatchObject({
      authorizationProof: false,
      roleMode: "ACCOUNT",
      selectedChildId: "child-1",
    });
  });

  it("requires an explicit choice when multiple linked children have no preference", () => {
    const session = new SessionStore();

    session.reconcileChildren(["child-1", "child-2"]);

    expect(session.current().selectedChildId).toBeUndefined();
  });

  it("switches the local child preference without treating it as authorization", () => {
    const session = new SessionStore();
    session.reconcileChildren(["child-1", "child-2"]);

    session.selectChild("child-2");

    expect(session.current()).toMatchObject({
      authorizationProof: false,
      roleMode: "ACCOUNT",
      selectedChildId: "child-2",
    });
  });

  it("clears a persisted preference when bootstrap no longer reports that child", () => {
    const persistence = new MemoryPersistence();
    const first = new SessionStore(persistence);
    first.selectChild("child-1");

    const restored = new SessionStore(persistence);
    restored.reconcileChildren(["child-2"]);

    expect(restored.current().selectedChildId).toBe("child-2");
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
