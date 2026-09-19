import type { AuditLog, CollectionName, DomainSchema, MediaAsset } from "../domain/model.js";
import type { IdGenerator } from "../shared/ids.js";
import type { Clock } from "../shared/time.js";

export type QueryPredicate<T> = Readonly<Partial<T>> | ((record: Readonly<T>) => boolean);
export type RecordPatch<T> = Readonly<Partial<Omit<T, "id" | "createdAt">>>;

export interface ReadRepository {
  read<K extends CollectionName>(collection: K, id: string): Promise<DomainSchema[K] | undefined>;
  query<K extends CollectionName>(
    collection: K,
    predicate?: QueryPredicate<DomainSchema[K]>,
  ): Promise<DomainSchema[K][]>;
}

export interface Transaction extends ReadRepository {
  insert<K extends CollectionName>(
    collection: K,
    record: DomainSchema[K],
  ): Promise<DomainSchema[K]>;
  update<K extends CollectionName>(
    collection: K,
    id: string,
    patch: RecordPatch<DomainSchema[K]> | ((record: DomainSchema[K]) => DomainSchema[K]),
  ): Promise<DomainSchema[K]>;
  remove<K extends CollectionName>(collection: K, id: string): Promise<void>;
  appendAudit(record: AuditLog): Promise<AuditLog>;
}

export interface Repository extends ReadRepository {
  transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
}

export interface ApplicationDependencies {
  readonly repository: Repository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface RecognizedTaskFields {
  readonly title?: string;
  readonly description?: string;
  readonly category?: string;
  readonly startsAt?: string;
  readonly dueAt?: string;
  readonly confidence: number;
  readonly provider: string;
  readonly providerVersion: string;
}

export interface TaskDraftProvider {
  generateTaskDraft(input: {
    readonly image: Uint8Array;
    readonly mimeType: MediaAsset["mimeType"];
    readonly requestId: string;
  }): Promise<RecognizedTaskFields>;
}

export interface MediaStorage {
  read(fileId: string): Promise<Uint8Array>;
  upload?(storageKey: string, content: Uint8Array): Promise<string>;
  downloadUrl?(fileId: string): Promise<string>;
  createUploadUrl(storageKey: string, expiresAt: string): Promise<string>;
  delete(storageKey: string): Promise<void>;
}
