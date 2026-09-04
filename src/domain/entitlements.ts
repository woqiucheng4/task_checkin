import type { TenantScope } from "./model.js";

export function sameTenantScope(left: TenantScope, right: TenantScope): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "FAMILY" && right.kind === "FAMILY") {
    return left.familyId === right.familyId;
  }
  if (left.kind === "ORGANIZATION" && right.kind === "ORGANIZATION") {
    return left.organizationId === right.organizationId;
  }
  if (left.kind === "CONTENT_PROVIDER" && right.kind === "CONTENT_PROVIDER") {
    return left.contentProviderId === right.contentProviderId;
  }
  return left.kind === "PLATFORM" && right.kind === "PLATFORM";
}
