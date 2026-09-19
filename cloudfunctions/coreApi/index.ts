import * as cloud from "wx-server-sdk";
import { createCoreApi } from "../../src/application/core-api.js";
import { MvpPolicy } from "../../src/application/mvp-policy.js";
import {
  CloudBaseRepository,
  type CloudDatabase,
} from "../../src/infrastructure/cloudbase-repository.js";
import { CryptoIdGenerator } from "../../src/shared/ids.js";
import { SystemClock } from "../../src/shared/time.js";
import {
  CloudMediaStorage,
  type CloudStorage,
} from "../../src/infrastructure/cloud-media-storage.js";
import { createOptionalDeepSeekTaskDraftProvider } from "../../src/infrastructure/deepseek-task-draft-provider.js";
import { createCloudFunctionHandler } from "./handler.js";

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV as unknown as string });

const repository = new CloudBaseRepository(cloud.database() as unknown as CloudDatabase);
const taskDraftProvider = createOptionalDeepSeekTaskDraftProvider(process.env);
const allowedFileIdAuthorities = (process.env.TASK_CHECKIN_CLOUD_FILE_AUTHORITIES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const api = createCoreApi({
  clock: new SystemClock(),
  ids: new CryptoIdGenerator(),
  repository,
  aiTaskDraftEnabled: process.env.AI_TASK_DRAFT_ENABLED !== "false",
  mediaStorage: new CloudMediaStorage(cloud as unknown as CloudStorage, { allowedFileIdAuthorities }),
  mvpPolicy: new MvpPolicy({ enabled: process.env.PRODUCT_EDITION === "CHILD_TEACHER_MVP" }),
  taskDraftProvider,
});
const configuredPlatformOpenIds = new Set(
  (process.env.PLATFORM_OPERATOR_OPENIDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
);
const configuredCallerAppIds = new Set(
  (process.env.ALLOWED_CALLER_APPIDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
);

export const main = createCloudFunctionHandler(
  api,
  () => cloud.getWXContext(),
  (openId) => configuredPlatformOpenIds.has(openId),
  (appId) => configuredCallerAppIds.has(appId),
);

export { createCloudFunctionHandler } from "./handler.js";
