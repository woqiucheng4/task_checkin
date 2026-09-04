import { assertConfiguredEnvironment, CLOUD_ENV_ID } from "./config/env.js";

App({
  onLaunch() {
    wx.cloud.init({ env: assertConfiguredEnvironment(CLOUD_ENV_ID), traceUser: true });
  },
});
