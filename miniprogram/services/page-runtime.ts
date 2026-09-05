import { CoreApiClient } from "./core-api.js";

export const coreApiClient = new CoreApiClient({
  callFunction: (input) => wx.cloud.callFunction(input),
});

export function navigate(path: string): void {
  wx.navigateTo({ url: path });
}

export function replace(path: string): void {
  wx.redirectTo({ url: path });
}
