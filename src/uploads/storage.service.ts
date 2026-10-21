export interface StoredFile {
  /** Public URL path, e.g. `/uploads/abc123.webp`. */
  url: string;
  /** Storage key/filename. */
  key: string;
}

/**
 * Abstraction over the file store. The local-disk implementation lives in
 * LocalStorageService; swap in an S3/MinIO implementation later without
 * touching callers.
 */
export abstract class StorageService {
  abstract save(buffer: Buffer, extension: string): Promise<StoredFile>;
  abstract remove(key: string): Promise<void>;
  /** Every stored file with its last-modified time (for orphan sweeps). */
  abstract list(): Promise<{ key: string; modifiedAt: Date }[]>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
