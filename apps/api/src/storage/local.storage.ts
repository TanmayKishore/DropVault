import fs from 'fs';
import path from 'path';
import { pipeline, Readable } from 'stream';
import { promisify } from 'util';
import { IStorageProvider, StorageObjectMetadata, StorageUploadOptions } from './storage.interface.js';
import { AppError } from '../middleware/error.middleware.js';

const streamPipeline = promisify(pipeline);

export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor(baseDir: string = './uploads') {
    this.baseDir = path.resolve(baseDir);
    // Ensure base directory exists
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolveSafePath(storageKey: string): string {
    // Prevent path traversal attacks
    const normalizedKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.resolve(this.baseDir, normalizedKey);

    if (!fullPath.startsWith(this.baseDir)) {
      throw new AppError('Invalid storage path. Path traversal detected.', 400);
    }
    return fullPath;
  }

  async uploadStream(
    stream: Readable,
    options: StorageUploadOptions
  ): Promise<{ storageKey: string; bytesWritten: number; etag?: string }> {
    const filePath = this.resolveSafePath(options.storageKey);
    const parentDir = path.dirname(filePath);

    if (!fs.existsSync(parentDir)) {
      await fs.promises.mkdir(parentDir, { recursive: true });
    }

    let bytesWritten = 0;
    const writeStream = fs.createWriteStream(filePath, { flags: 'w' });

    // Track bytes written
    writeStream.on('drain', () => {
      // Stream backpressure functioning properly
    });

    try {
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          bytesWritten += chunk.length;
        });

        stream.on('error', (err) => {
          writeStream.destroy(err);
          reject(err);
        });

        writeStream.on('error', (err) => {
          reject(err);
        });

        writeStream.on('finish', () => {
          resolve();
        });

        stream.pipe(writeStream);
      });

      return {
        storageKey: options.storageKey,
        bytesWritten,
      };
    } catch (error) {
      // Clean up partial file on failure
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      } catch (cleanupErr) {
        console.error(`[LocalStorageProvider] Failed to clean up partial file ${filePath}:`, cleanupErr);
      }
      throw error;
    }
  }

  async getStream(
    storageKey: string,
    range?: { start: number; end: number }
  ): Promise<Readable> {
    const filePath = this.resolveSafePath(storageKey);

    if (!fs.existsSync(filePath)) {
      throw new AppError('File not found in storage', 404);
    }

    const options: { start?: number; end?: number } = {};
    if (range) {
      options.start = range.start;
      options.end = range.end;
    }

    return fs.createReadStream(filePath, options);
  }

  async deleteObject(storageKey: string): Promise<void> {
    const filePath = this.resolveSafePath(storageKey);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      console.error(`[LocalStorageProvider] Error deleting ${filePath}:`, err);
      throw new AppError('Failed to delete file from storage', 500);
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const filePath = this.resolveSafePath(storageKey);
    return fs.existsSync(filePath);
  }

  async getMetadata(storageKey: string): Promise<StorageObjectMetadata> {
    const filePath = this.resolveSafePath(storageKey);
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        contentLength: stats.size,
        mimeType: 'application/octet-stream',
        lastModified: stats.mtime,
      };
    } catch {
      throw new AppError('File not found in storage', 404);
    }
  }
}
