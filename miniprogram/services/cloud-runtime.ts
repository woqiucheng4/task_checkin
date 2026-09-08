import {
  assertConfiguredEnvironment,
  CLOUD_ENV_ID,
  CLOUD_MODE,
  CLOUD_RESOURCE_APP_ID,
} from "../config/env.js";

type CloudClient = Pick<MiniCloud, "callFunction" | "uploadFile">;
let ready: Promise<CloudClient> | undefined;
export function cloudReady(): Promise<CloudClient> {
  if (!ready) {
    ready = (async () => {
      const env = assertConfiguredEnvironment(CLOUD_ENV_ID);
      if (CLOUD_MODE === "shared") {
        if (!CLOUD_RESOURCE_APP_ID) throw new Error("共享环境缺少资源方 AppID");
        const cloud = new wx.cloud.Cloud({
          resourceAppid: CLOUD_RESOURCE_APP_ID,
          resourceEnv: env,
        });
        await cloud.init();
        return cloud;
      }
      wx.cloud.init({ env, traceUser: true });
      return wx.cloud;
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
  }
  return ready;
}
