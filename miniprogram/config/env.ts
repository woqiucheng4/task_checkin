export const CLOUD_ENV_ID = "zufang-9g5z3mbf127882aa";
export const CLOUD_RESOURCE_APP_ID = "wx0d22b0cfcfa8f232";
export const CLOUD_MODE: "direct" | "shared" = "shared";
export const TASK_CHECKIN_CLOUD_FUNCTION = "taskCheckinCoreApi";

export function assertConfiguredEnvironment(environmentId: string): string {
  if (environmentId.length === 0 || environmentId.startsWith("__")) {
    throw new Error("构建时必须注入 CloudBase 环境 ID");
  }
  return environmentId;
}
