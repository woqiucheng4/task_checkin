import type { AdminApiClient, AdminRequest, AdminResult } from "./types";

export interface AdminTransport {
  request<T>(input: {
    readonly body: AdminRequest;
    readonly headers: Readonly<Record<string, string>>;
  }): Promise<AdminResult<T>>;
}

export class AuthenticatedAdminApiClient implements AdminApiClient {
  constructor(
    private readonly transport: AdminTransport,
    private readonly accessToken: () => Promise<string>,
  ) {}

  async execute<T>(request: AdminRequest): Promise<AdminResult<T>> {
    const token = await this.accessToken();
    if (token.trim().length === 0) {
      return { error: { code: "UNAUTHORIZED", message: "登录状态已失效，请重新登录" }, ok: false };
    }
    return this.transport.request<T>({
      body: request,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  }
}
