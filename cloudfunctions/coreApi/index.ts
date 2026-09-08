import * as cloud from "wx-server-sdk";
import { createCoreApi } from "../../src/application/core-api.js";
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
import { DomainError } from "../../src/shared/errors.js";
import { createCloudFunctionHandler } from "./handler.js";

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV as unknown as string });

const repository = new CloudBaseRepository(cloud.database() as unknown as CloudDatabase);
const api = createCoreApi({
  clock: new SystemClock(),
  ids: new CryptoIdGenerator(),
  repository,
  mediaStorage: new CloudMediaStorage(cloud as unknown as CloudStorage),
  ocrProvider: {
    async recognize() {
      throw new DomainError("CONFLICT", "图片识别服务尚未配置，请手动填写任务");
    },
  },
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
