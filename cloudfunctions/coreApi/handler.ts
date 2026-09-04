import type { CoreApi, CoreAuthContext } from "../../src/application/core-api.js";

interface WxRuntimeContext {
  readonly OPENID?: string;
}

type WxContextReader = () => WxRuntimeContext;

export function createCloudFunctionHandler(
  api: CoreApi,
  getWxContext: WxContextReader,
  isPlatformOperator: (openId: string) => boolean = () => false,
): (event: unknown, context: unknown) => Promise<unknown> {
  return async (event, _context) => {
    const runtime = getWxContext();
    const openId = runtime.OPENID ?? "";
    const auth: CoreAuthContext = {
      openId,
      ...(isPlatformOperator(openId) ? { isPlatformOperator: true } : {}),
    };
    return api.handle(event, auth);
  };
}
