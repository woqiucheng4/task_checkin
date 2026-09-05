declare const App: (options: { readonly onLaunch?: () => void }) => void;
declare const Page: (options: Readonly<Record<string, unknown>>) => void;
interface MiniComponentInstance {
  readonly properties: Readonly<Record<string, unknown>>;
  triggerEvent(name: string, detail?: unknown): void;
}

declare const Component: (options: {
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly methods?: ThisType<MiniComponentInstance> & Readonly<Record<string, unknown>>;
}) => void;

declare const wx: {
  readonly cloud: {
    init(input: { readonly env: string; readonly traceUser: boolean }): void;
  };
  navigateBack(input?: { readonly delta?: number }): void;
  navigateTo(input: { readonly url: string }): void;
  redirectTo(input: { readonly url: string }): void;
};
