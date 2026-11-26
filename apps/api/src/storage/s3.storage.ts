import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { IStorageProvider, StorageObjectMetadata, StorageUploadOptions } from './storage.interface.js';
import { AppError } from '../middleware/error.middleware.js';

export interface S3StorageConfig {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class S3StorageProvider implements IStorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    // Uses default AWS credential provider chain if credentials are not explicitly supplied
    this.client = new S3Client({
      region: config.region,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });
  }

  async uploadStream(
    stream: Readable,
    options: StorageUploadOptions
  ): Promise<{ storageKey: string; bytesWritten: number; etag?: string }> {
    let bytesWritten = 0;
    stream.on('data', (chunk: Buffer) => {
      bytesWritten += chunk.length;
    });

    const parallelUpload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: options.storageKey,
        Body: stream,
        ContentType: options.mimeType,
        ServerSideEncryption: 'AES256',
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024, // 5 MB part size
      leavePartsOnError: false, // Automatically cleans up parts on error
    });

    try {
      const result = await parallelUpload.done();
      return {
        storageKey: options.storageKey,
        bytesWritten,
        etag: result.ETag,
      };
    } catch (error) {
      try {
        await parallelUpload.abort();
      } catch (abortErr) {
        console.error(`[S3StorageProvider] Failed to abort multipart upload for ${options.storageKey}:`, abortErr);
      }
      throw error;
    }
  }

  async getStream(
    storageKey: string,
    range?: { start: number; end: number }
  ): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      });

      const response = await this.client.send(command);
      if (!response.Body) {
        throw new AppError('Empty response body from S3', 500);
      }

      return response.Body as Readable;
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new AppError('File not found in S3 storage', 404);
      }
      throw new AppError('Failed to retrieve file from S3', 500);
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });
      await this.client.send(command);
    } catch (err) {
      console.error(`[S3StorageProvider] Error deleting ${storageKey} from S3:`, err);
      throw new AppError('Failed to delete file from S3', 500);
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });
      await this.client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async getMetadata(storageKey: string): Promise<StorageObjectMetadata> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });
      const response = await this.client.send(command);
      return {
        contentLength: response.ContentLength || 0,
        mimeType: response.ContentType || 'application/octet-stream',
        lastModified: response.LastModified,
        etag: response.ETag,
      };
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        throw new AppError('File not found in S3 storage', 404);
      }
      throw new AppError('Failed to inspect file in S3', 500);
    }
  }
}
