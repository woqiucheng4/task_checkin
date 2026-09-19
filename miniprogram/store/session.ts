export type WorkspaceSelection =
  | { readonly kind: "FAMILY"; readonly id: string }
  | { readonly kind: "ORGANIZATION"; readonly id: string }
  | { readonly kind: "CONTENT_PROVIDER"; readonly id: string };

export type RoleMode = "ACCOUNT" | "CONTENT_PROVIDER";

export interface NavigationSession {
  readonly authorizationProof: false;
  readonly workspace?: WorkspaceSelection;
  readonly roleMode: RoleMode;
  /** Local UX preference; server authorization always validates child scope. */
  readonly selectedChildId?: string;
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
      ...(this.state.selectedChildId === undefined
        ? {}
        : { selectedChildId: this.state.selectedChildId }),
    };
    return this.persist();
  }

  selectRoleMode(roleMode: RoleMode): NavigationSession {
    this.state = {
      ...this.state,
      authorizationProof: false,
      roleMode,
    };
    return this.persist();
  }

  selectChild(childId: string): NavigationSession {
    const selectedChildId = childId.trim();
    if (!selectedChildId) throw new Error("请选择孩子");
    this.state = { ...this.state, authorizationProof: false, selectedChildId };
    return this.persist();
  }

  /**
   * Reconciles a local preference against children returned for the current
   * authenticated account. A sole option is deterministic; multiple options
   * require an explicit parent choice.
   */
  reconcileChildren(childIds: readonly string[]): NavigationSession {
    const linkedChildIds = [...new Set(childIds.map((childId) => childId.trim()).filter(Boolean))];
    const { selectedChildId, ...withoutSelection } = this.state;
    this.state = {
      ...withoutSelection,
      authorizationProof: false,
      ...(selectedChildId !== undefined && linkedChildIds.includes(selectedChildId)
        ? { selectedChildId }
        : linkedChildIds.length === 1
          ? { selectedChildId: linkedChildIds[0] }
          : {}),
    };
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
  const selectedChildId =
    typeof record.selectedChildId === "string" && record.selectedChildId.trim().length > 0
      ? record.selectedChildId
      : undefined;
  return {
    authorizationProof: false,
    roleMode,
    ...(workspace === undefined ? {} : { workspace }),
    ...(selectedChildId === undefined ? {} : { selectedChildId }),
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
  return value === "ACCOUNT" || value === "CONTENT_PROVIDER";
}
