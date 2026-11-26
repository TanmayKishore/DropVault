'use client';

import { useState, useRef, useCallback } from 'react';
import {
  ApiClient,
  FileUploadSuccessResponse,
  MAX_ANONYMOUS_SIZE_BYTES,
  MAX_AUTHENTICATED_SIZE_BYTES,
} from '@/lib/api';
import { auth, User } from '@/lib/auth';

export type UploadStatus =
  | 'idle'
  | 'file_selected'
  | 'uploading'
  | 'success'
  | 'error'
  | 'cancelled';

export interface UploadProgress {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  remainingSeconds: number | null;
}

export interface UploadResult {
  fileId: string;
  originalName: string;
  sizeBytes: string;
  mimeType: string;
  expiresAt: string;
  shareUrl: string;
  shortCode: string;
  managementToken?: string;
  isPasswordProtected: boolean;
  maxDownloads?: number | null;
}

export interface UseUploadReturn {
  status: UploadStatus;
  selectedFile: File | null;
  progress: UploadProgress;
  result: UploadResult | null;
  errorMessage: string | null;
  requiresAuth: boolean;
  expiryDays: number;
  password: string;
  maxDownloads: string;
  setExpiryDays: (days: number) => void;
  setPassword: (password: string) => void;
  setMaxDownloads: (max: string) => void;
  selectFile: (file: File | null, user: User | null) => void;
  removeFile: () => void;
  startUpload: () => Promise<void>;
  cancelUpload: () => void;
  resetUpload: () => void;
}

export function useUpload(): UseUploadReturn {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [password, setPassword] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);

  const [progress, setProgress] = useState<UploadProgress>({
    percent: 0,
    loadedBytes: 0,
    totalBytes: 0,
    speedBytesPerSec: 0,
    remainingSeconds: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const progressTrackingRef = useRef<{
    lastLoaded: number;
    lastTime: number;
    speeds: number[];
  }>({
    lastLoaded: 0,
    lastTime: 0,
    speeds: [],
  });

  const selectFile = useCallback((file: File | null, user: User | null) => {
    if (!file) {
      setSelectedFile(null);
      setStatus('idle');
      setErrorMessage(null);
      setRequiresAuth(false);
      return;
    }

    setErrorMessage(null);
    setResult(null);

    // Rule: Anonymous uploads maximum 1 GiB inclusive
    const isOverAnonymousLimit = file.size > MAX_ANONYMOUS_SIZE_BYTES;
    const isOverAuthenticatedLimit = file.size > MAX_AUTHENTICATED_SIZE_BYTES;

    if (isOverAuthenticatedLimit) {
      setSelectedFile(file);
      setStatus('error');
      setRequiresAuth(false);
      setErrorMessage(
        `File exceeds maximum allowed upload size (10 GiB). Selected file is ${(
          file.size / (1024 * 1024 * 1024)
        ).toFixed(2)} GiB.`
      );
      return;
    }

    if (isOverAnonymousLimit && !user) {
      setSelectedFile(file);
      setStatus('file_selected');
      setRequiresAuth(true);
      setErrorMessage(
        'Files larger than 1 GiB require authentication. Sign in or create a free account to upload files up to 10 GiB.'
      );
      return;
    }

    setSelectedFile(file);
    setRequiresAuth(false);
    setStatus('file_selected');
  }, []);

  const removeFile = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSelectedFile(null);
    setStatus('idle');
    setErrorMessage(null);
    setRequiresAuth(false);
    setProgress({
      percent: 0,
      loadedBytes: 0,
      totalBytes: 0,
      speedBytesPerSec: 0,
      remainingSeconds: null,
    });
  }, []);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('cancelled');
    setErrorMessage('Upload cancelled by user.');
  }, []);

  const resetUpload = useCallback(() => {
    removeFile();
    setPassword('');
    setMaxDownloads('');
    setExpiryDays(7);
    setResult(null);
  }, [removeFile]);

  const startUpload = useCallback(async () => {
    if (!selectedFile) return;

    const user = auth.getUser();
    if (selectedFile.size > MAX_ANONYMOUS_SIZE_BYTES && !user) {
      setRequiresAuth(true);
      setStatus('error');
      setErrorMessage(
        'Files larger than 1 GiB require registration or login before uploading.'
      );
      return;
    }

    setStatus('uploading');
    setErrorMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    progressTrackingRef.current = {
      lastLoaded: 0,
      lastTime: Date.now(),
      speeds: [],
    };

    setProgress({
      percent: 0,
      loadedBytes: 0,
      totalBytes: selectedFile.size,
      speedBytesPerSec: 0,
      remainingSeconds: null,
    });

    try {
      const uploadResponse: FileUploadSuccessResponse = await ApiClient.uploadFile(
        selectedFile,
        {
          expiryDays,
          signal: abortController.signal,
          onProgress: (percent, loadedBytes, totalBytes) => {
            const now = Date.now();
            const timeDiff = (now - progressTrackingRef.current.lastTime) / 1000;

            let currentSpeed = 0;
            let remainingSecs: number | null = null;

            if (timeDiff >= 0.5) {
              const bytesDiff = loadedBytes - progressTrackingRef.current.lastLoaded;
              currentSpeed = bytesDiff / timeDiff;

              const speeds = progressTrackingRef.current.speeds;
              speeds.push(currentSpeed);
              if (speeds.length > 5) speeds.shift();

              const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
              if (avgSpeed > 0) {
                remainingSecs = Math.max(0, Math.round((totalBytes - loadedBytes) / avgSpeed));
              }

              progressTrackingRef.current.lastLoaded = loadedBytes;
              progressTrackingRef.current.lastTime = now;

              setProgress({
                percent,
                loadedBytes,
                totalBytes,
                speedBytesPerSec: avgSpeed,
                remainingSeconds: remainingSecs,
              });
            } else {
              setProgress((prev) => ({
                ...prev,
                percent,
                loadedBytes,
                totalBytes,
              }));
            }
          },
        }
      );

      const uploadedData = uploadResponse.data;
      let finalShortCode = uploadedData.shareLink.shortCode;
      let finalHasPassword = false;
      let finalMaxDownloads: number | null = null;

      // If user configured password or download limits, create configured share link via backend API
      const parsedMaxDownloads = maxDownloads ? parseInt(maxDownloads, 10) : undefined;
      const hasCustomConfig = Boolean(password || (parsedMaxDownloads && parsedMaxDownloads > 0));

      if (hasCustomConfig) {
        try {
          const shareLinkRes = await ApiClient.createShareLink(uploadedData.file.id, {
            password: password || undefined,
            maxDownloads: parsedMaxDownloads,
            managementToken: uploadedData.managementToken,
          });
          finalShortCode = shareLinkRes.data.shortCode;
          finalHasPassword = shareLinkRes.data.hasPassword;
          finalMaxDownloads = shareLinkRes.data.maxDownloads;
        } catch (shareLinkErr: any) {
          console.warn('[Upload] Failed to attach custom share link config:', shareLinkErr);
          // Still proceed with default link created at upload time
        }
      }

      const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const shareUrl = `${appBaseUrl}/share/${finalShortCode}`;

      setResult({
        fileId: uploadedData.file.id,
        originalName: uploadedData.file.originalName,
        sizeBytes: uploadedData.file.sizeBytes,
        mimeType: uploadedData.file.mimeType,
        expiresAt: uploadedData.file.expiresAt,
        shareUrl,
        shortCode: finalShortCode,
        managementToken: uploadedData.managementToken,
        isPasswordProtected: finalHasPassword,
        maxDownloads: finalMaxDownloads,
      });

      setStatus('success');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatus('cancelled');
        setErrorMessage('Upload was cancelled.');
      } else {
        setStatus('error');
        setErrorMessage(err.message || 'Upload failed. Please try again.');
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [selectedFile, expiryDays, password, maxDownloads]);

  return {
    status,
    selectedFile,
    progress,
    result,
    errorMessage,
    requiresAuth,
    expiryDays,
    password,
    maxDownloads,
    setExpiryDays,
    setPassword,
    setMaxDownloads,
    selectFile,
    removeFile,
    startUpload,
    cancelUpload,
    resetUpload,
  };
}
