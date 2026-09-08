import type { CoreApi, CoreAuthContext } from "../../src/application/core-api.js";

interface WxRuntimeContext {
  readonly OPENID?: string;
  readonly APPID?: string;
  readonly FROM_APPID?: string;
  readonly FROM_OPENID?: string;
}

type WxContextReader = () => WxRuntimeContext;
type CallerAppIdPolicy = (appId: string) => boolean;

export function createCloudFunctionHandler(
  api: CoreApi,
  getWxContext: WxContextReader,
  isPlatformOperator: (openId: string) => boolean = () => false,
  isAllowedCallerAppId: CallerAppIdPolicy = () => false,
): (event: unknown, context: unknown) => Promise<unknown> {
  return async (event, _context) => {
    const runtime = getWxContext();
    const shared = runtime.FROM_APPID !== undefined || runtime.FROM_OPENID !== undefined;
    const callerAppId = (shared ? runtime.FROM_APPID : runtime.APPID) ?? "";
    const openId = (shared ? runtime.FROM_OPENID : runtime.OPENID) ?? "";
    if (!callerAppId || !openId || !isAllowedCallerAppId(callerAppId)) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "当前小程序无权调用此云函数" },
      };
    }
    const auth: CoreAuthContext = {
      openId,
      ...(isPlatformOperator(openId) ? { isPlatformOperator: true } : {}),
    };
    return api.handle(event, auth);
  };
}
