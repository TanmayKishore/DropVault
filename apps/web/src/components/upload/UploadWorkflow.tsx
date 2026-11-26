'use client';

import React, { useEffect, useState } from 'react';
import { useUpload } from '@/hooks/useUpload';
import { auth, User } from '@/lib/auth';
import { UploadDropzone } from './UploadDropzone';
import { UploadConfig } from './UploadConfig';
import { UploadProgressView } from './UploadProgress';
import { UploadSuccessView } from './UploadSuccess';
import { Button } from '@/components/ui/Button';
import { ArrowUpRight, AlertCircle, RefreshCw } from 'lucide-react';

export const UploadWorkflow: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    // Subscribe to auth changes and initialize
    setCurrentUser(auth.getUser());
    const unsubscribe = auth.subscribe((user) => {
      setCurrentUser(user);
    });
    void auth.fetchMe();
    return unsubscribe;
  }, []);

  const {
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
  } = useUpload();

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {status === 'success' && result ? (
        <UploadSuccessView result={result} onUploadAnother={resetUpload} />
      ) : status === 'uploading' && selectedFile ? (
        <UploadProgressView
          fileName={selectedFile.name}
          progress={progress}
          onCancel={cancelUpload}
        />
      ) : (
        <div className="space-y-4">
          <UploadDropzone
            selectedFile={selectedFile}
            onFileSelect={(file) => selectFile(file, currentUser)}
            onFileRemove={removeFile}
            requiresAuth={requiresAuth}
            disabled={status === 'uploading'}
          />

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-status-error/15 border border-status-error/30 text-sm text-status-error flex items-start space-x-2.5">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-status-error" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Configuration Options (When file selected and not uploading) */}
          {selectedFile && !requiresAuth && (
            <>
              <UploadConfig
                expiryDays={expiryDays}
                onExpiryDaysChange={setExpiryDays}
                password={password}
                onPasswordChange={setPassword}
                maxDownloads={maxDownloads}
                onMaxDownloadsChange={setMaxDownloads}
                disabled={status === 'uploading'}
              />

              <div className="flex items-center justify-end space-x-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={removeFile}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={startUpload}
                  rightIcon={<ArrowUpRight className="h-4 w-4" />}
                >
                  Upload and Create Link
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
