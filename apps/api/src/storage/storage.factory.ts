import { StorageProvider } from '@prisma/client';
import { config } from '../config/env.js';
import { IStorageProvider } from './storage.interface.js';
import { LocalStorageProvider } from './local.storage.js';
import { S3StorageProvider } from './s3.storage.js';

let storageInstance: IStorageProvider | null = null;

export const getStorageProvider = (): IStorageProvider => {
  if (storageInstance) {
    return storageInstance;
  }

  if (config.STORAGE_PROVIDER === 's3') {
    if (!config.AWS_BUCKET_NAME) {
      throw new Error('AWS_BUCKET_NAME is required for S3 storage provider');
    }
    storageInstance = new S3StorageProvider({
      region: config.AWS_REGION,
      bucket: config.AWS_BUCKET_NAME,
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    });
  } else {
    storageInstance = new LocalStorageProvider(config.LOCAL_STORAGE_PATH);
  }

  return storageInstance;
};

/**
 * Resolves the storage provider matching a file's persisted storageProvider enum,
 * regardless of the currently active default STORAGE_PROVIDER configuration.
 */
export const getStorageProviderForType = (providerType: StorageProvider): IStorageProvider => {
  if (providerType === StorageProvider.S3) {
    if (config.STORAGE_PROVIDER === 's3' && config.AWS_BUCKET_NAME) {
      return getStorageProvider();
    }
    return new S3StorageProvider({
      region: config.AWS_REGION,
      bucket: config.AWS_BUCKET_NAME || 'fallback-bucket',
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    });
  }

  if (config.STORAGE_PROVIDER !== 's3') {
    return getStorageProvider();
  }
  return new LocalStorageProvider(config.LOCAL_STORAGE_PATH);
};
