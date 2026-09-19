export type DomainErrorCode =
  | "ALREADY_EXISTS"
  | "CONFLICT"
  | "FORBIDDEN"
  | "FEATURE_DISABLED"
  | "INTERNAL_ERROR"
  | "INVALID_COMMAND"
  | "INVALID_INPUT"
  | "INVITATION_EXPIRED"
  | "NOT_FOUND"
  | "QUOTA_EXCEEDED"
  | "SUPPORT_GRANT_REQUIRED"
  | "UNAUTHORIZED";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
