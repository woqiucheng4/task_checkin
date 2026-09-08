export function digest(value: unknown): string;
export function validateSnapshot(snapshot: unknown, collectionNames: readonly string[]): void;
export function collectFileIds(value: unknown, result?: Set<string>): Set<string>;
export function remapFileIds<T>(value: T, mapping: Readonly<Record<string, string>>): T;
export function ownFilePath(fileId: string, envId: string): string;
interface FileReader {
  downloadFile(input: { fileID: string }): Promise<{ fileContent?: Buffer | undefined }>;
}
interface FileWriter extends FileReader {
  uploadFile(input: { cloudPath: string; fileContent: Buffer }): Promise<{ fileID: string }>;
}
export function copyApplicationFiles(
  snapshot: { sourceEnv: string; collections: unknown },
  source: FileReader,
  target: FileWriter,
  targetEnv: string,
): Promise<Record<string, string>>;
