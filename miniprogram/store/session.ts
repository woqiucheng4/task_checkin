export type WorkspaceSelection =
  | { readonly kind: "FAMILY"; readonly id: string }
  | { readonly kind: "ORGANIZATION"; readonly id: string }
  | { readonly kind: "CONTENT_PROVIDER"; readonly id: string };

export type RoleMode = "ACCOUNT" | "CHILD" | "CONTENT_PROVIDER";

export interface NavigationSession {
  readonly authorizationProof: false;
  readonly workspace?: WorkspaceSelection;
  readonly roleMode: RoleMode;
  readonly childId?: string;
}

export interface SessionPersistence {
  load(): unknown;
  save(value: unknown): void;
}

const INITIAL_STATE: NavigationSession = {
  authorizationProof: false,
  roleMode: "ACCOUNT",
};

export class SessionStore {
  private state: NavigationSession;

  constructor(private readonly persistence?: SessionPersistence) {
    this.state = parsePersistedSession(persistence?.load());
  }

  current(): NavigationSession {
    return structuredClone(this.state);
  }

  selectWorkspace(workspace: WorkspaceSelection): NavigationSession {
    const changed =
      this.state.workspace?.kind !== workspace.kind || this.state.workspace.id !== workspace.id;
    this.state = {
      authorizationProof: false,
      roleMode: changed ? "ACCOUNT" : this.state.roleMode,
      workspace: structuredClone(workspace),
      ...(changed || this.state.childId === undefined ? {} : { childId: this.state.childId }),
    };
    return this.persist();
  }

  selectRoleMode(roleMode: RoleMode): NavigationSession {
    const { childId: selectedChildId, ...withoutChild } = this.state;
    this.state = {
      ...withoutChild,
      ...(roleMode === "CHILD" && selectedChildId !== undefined
        ? { childId: selectedChildId }
        : {}),
      authorizationProof: false,
      roleMode,
    };
    return this.persist();
  }

  selectChild(childId: string): NavigationSession {
    if (this.state.roleMode !== "CHILD" || childId.trim().length === 0) {
      throw new Error("选择孩子前必须进入孩子模式");
    }
    this.state = { ...this.state, authorizationProof: false, childId };
    return this.persist();
  }

  clear(): NavigationSession {
    this.state = structuredClone(INITIAL_STATE);
    return this.persist();
  }

  private persist(): NavigationSession {
    this.persistence?.save(this.state);
    return this.current();
  }
}

function parsePersistedSession(value: unknown): NavigationSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return structuredClone(INITIAL_STATE);
  }
  const record = value as Readonly<Record<string, unknown>>;
  const roleMode = isRoleMode(record.roleMode) ? record.roleMode : "ACCOUNT";
  const workspace = parseWorkspace(record.workspace);
  const childId = typeof record.childId === "string" ? record.childId : undefined;
  return {
    authorizationProof: false,
    roleMode,
    ...(workspace === undefined ? {} : { workspace }),
    ...(roleMode === "CHILD" && childId !== undefined ? { childId } : {}),
  };
}

function parseWorkspace(value: unknown): WorkspaceSelection | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    typeof record.id !== "string" ||
    !["FAMILY", "ORGANIZATION", "CONTENT_PROVIDER"].includes(String(record.kind))
  ) {
    return undefined;
  }
  return { id: record.id, kind: record.kind as WorkspaceSelection["kind"] };
}

function isRoleMode(value: unknown): value is RoleMode {
  return value === "ACCOUNT" || value === "CHILD" || value === "CONTENT_PROVIDER";
}
