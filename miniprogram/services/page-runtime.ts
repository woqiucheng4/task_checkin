import { CoreApiClient } from "./core-api.js";
import { cloudReady } from "./cloud-runtime.js";

export const coreApiClient = new CoreApiClient({
  callFunction: async (input) => (await cloudReady()).callFunction(input),
});

export function navigate(path: string): void {
  wx.navigateTo({ url: path });
}

export function replace(path: string): void {
  wx.redirectTo({ url: path });
}
