declare const App: (options: { readonly onLaunch?: () => void }) => void;
interface MiniPageInstance {
  readonly data: Readonly<Record<string, unknown>>;
  setData(data: object): void;
}

declare const Page: (
  options: ThisType<MiniPageInstance> & Readonly<Record<string, unknown>>,
) => void;
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
    callFunction(input: {
      readonly data: Readonly<Record<string, unknown>>;
      readonly name: string;
    }): Promise<{ readonly result?: unknown }>;
    init(input: { readonly env: string; readonly traceUser: boolean }): void;
    uploadFile(input: {
      readonly cloudPath: string;
      readonly filePath: string;
    }): Promise<{ readonly fileID: string }>;
  };
  chooseMedia(input: {
    readonly count: number;
    readonly mediaType: readonly ("image" | "video")[];
    readonly sourceType: readonly ("album" | "camera")[];
  }): Promise<{ readonly tempFiles: readonly { readonly tempFilePath: string }[] }>;
  navigateBack(input?: { readonly delta?: number }): void;
  navigateTo(input: { readonly url: string }): void;
  redirectTo(input: { readonly url: string }): void;
  showToast(input: { readonly icon?: "none" | "success"; readonly title: string }): void;
};
