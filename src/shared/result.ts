import { DomainError, type DomainErrorCode } from "./errors.js";

export interface CommandError {
  code: DomainErrorCode;
  message: string;
}

export type CommandResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: CommandError };

export function commandSuccess<T>(data: T): CommandResult<T> {
  return { ok: true, data };
}

export function commandFailure(error: unknown): CommandResult<never> {
  if (error instanceof DomainError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message },
    };
  }

  return {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "服务暂时不可用" },
  };
}
