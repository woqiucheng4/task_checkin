export const CLOUD_ENV_ID = "__CLOUDBASE_ENV_ID__";

export function assertConfiguredEnvironment(environmentId: string): string {
  if (environmentId.length === 0 || environmentId.startsWith("__")) {
    throw new Error("构建时必须注入 CloudBase 环境 ID");
  }
  return environmentId;
}
