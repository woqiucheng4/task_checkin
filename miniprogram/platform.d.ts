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
  setData(data: object): void;
}

declare const Component: (options: {
  readonly data?: Readonly<Record<string, unknown>>;
  readonly lifetimes?: ThisType<MiniComponentInstance> & Readonly<Record<string, unknown>>;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly methods?: ThisType<MiniComponentInstance> & Readonly<Record<string, unknown>>;
}) => void;

interface MiniCloud {
  callFunction(input: {
    readonly data: Readonly<Record<string, unknown>>;
    readonly name: string;
  }): Promise<{ readonly result?: unknown }>;
  uploadFile(input: {
    readonly cloudPath: string;
    readonly filePath: string;
  }): Promise<{ readonly fileID: string }>;
  init(): Promise<void>;
}
declare const wx: {
  getFileSystemManager(): { readFileSync(path: string, encoding: "base64"): string };
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  getWindowInfo(): {
    statusBarHeight: number;
    safeArea?: { top: number; bottom: number };
    windowWidth: number;
  };
  getMenuButtonBoundingClientRect(): { bottom: number; top: number; height: number };
  readonly cloud: {
    Cloud: new (input: { resourceAppid: string; resourceEnv: string }) => MiniCloud;
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
