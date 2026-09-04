declare module "wx-server-sdk" {
  export const DYNAMIC_CURRENT_ENV: symbol;
  export function init(input: { readonly env: string }): void;
  export function database(): unknown;
  export function getWXContext(): { readonly OPENID?: string };
}
