declare const App: (options: { readonly onLaunch?: () => void }) => void;
declare const Page: (options: Readonly<Record<string, unknown>>) => void;

declare const wx: {
  readonly cloud: {
    init(input: { readonly env: string; readonly traceUser: boolean }): void;
  };
};
