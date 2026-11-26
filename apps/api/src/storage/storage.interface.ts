import { Readable } from 'stream';

export interface StorageUploadOptions {
  storageKey: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface StorageObjectMetadata {
  contentLength: number;
  mimeType: string;
  lastModified?: Date;
  etag?: string;
}

export interface IStorageProvider {
  /**
   * Uploads a stream directly to storage without in-memory buffering.
   */
  uploadStream(
    stream: Readable,
    options: StorageUploadOptions
  ): Promise<{ storageKey: string; bytesWritten: number; etag?: string }>;

  /**
   * Gets a readable stream for reading file contents, optionally with byte range.
   */
  getStream(
    storageKey: string,
    range?: { start: number; end: number }
  ): Promise<Readable>;

  /**
   * Deletes an object permanently from storage.
   */
  deleteObject(storageKey: string): Promise<void>;

  /**
   * Checks if an object exists.
   */
  exists(storageKey: string): Promise<boolean>;

  /**
   * Gets object metadata (size, mime type, etc.).
   */
  getMetadata(storageKey: string): Promise<StorageObjectMetadata>;
}
