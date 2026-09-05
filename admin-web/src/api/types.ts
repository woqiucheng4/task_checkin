export type AdminRole = "institution" | "platform" | "provider";

export interface AdminSession {
  readonly accountLabel: string;
  readonly role: AdminRole;
  readonly workspaceLabel: string;
}

export interface AdminRequest {
  readonly action: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type AdminResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export interface AdminApiClient {
  execute<T>(request: AdminRequest): Promise<AdminResult<T>>;
}
