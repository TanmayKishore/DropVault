'use client';

import React from 'react';
import { UploadProgress as UploadProgressType } from '@/hooks/useUpload';
import { Button } from '@/components/ui/Button';
import { X, ArrowUpRight } from 'lucide-react';

interface UploadProgressProps {
  fileName: string;
  progress: UploadProgressType;
  onCancel: () => void;
}

export const UploadProgressView: React.FC<UploadProgressProps> = ({
  fileName,
  progress,
  onCancel,
}) => {
  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec <= 0) return 'Calculating...';
    if (bytesPerSec < 1024 * 1024) {
      return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    }
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  };

  const formatRemaining = (seconds: number | null) => {
    if (seconds === null || seconds < 0) return 'Estimating...';
    if (seconds < 60) return `${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s remaining`;
  };

  const formatLoaded = (loaded: number, total: number) => {
    const toMB = (b: number) => (b / (1024 * 1024)).toFixed(1);
    return `${toMB(loaded)} MB / ${toMB(total)} MB`;
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-accent uppercase tracking-wider">
            Streaming Upload
          </span>
          <h4 className="text-base font-semibold text-text-primary truncate max-w-sm">
            {fileName}
          </h4>
        </div>
        <span className="text-2xl font-bold font-mono text-accent">
          {progress.percent}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-surface rounded-full h-3 overflow-hidden border border-border">
        <div
          className="bg-primary h-full rounded-full transition-all duration-300 ease-out shadow-glow"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between text-xs text-text-secondary gap-2 pt-1">
        <span>{formatLoaded(progress.loadedBytes, progress.totalBytes)}</span>
        <div className="flex items-center space-x-3">
          <span>{formatSpeed(progress.speedBytesPerSec)}</span>
          <span>&bull;</span>
          <span>{formatRemaining(progress.remainingSeconds)}</span>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          leftIcon={<X className="h-4 w-4" />}
          className="text-text-muted hover:text-status-error"
        >
          Cancel Upload
        </Button>
      </div>
    </div>
  );
};
