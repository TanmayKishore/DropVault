'use client';

import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, File as FileIcon, X, AlertTriangle, ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MAX_ANONYMOUS_SIZE_BYTES } from '@/lib/api';
import Link from 'next/link';

interface UploadDropzoneProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  requiresAuth: boolean;
  disabled?: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  selectedFile,
  onFileSelect,
  onFileRemove,
  requiresAuth,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  const handleBrowseClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && !selectedFile && !disabled) {
      e.preventDefault();
      handleBrowseClick();
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInput}
        disabled={disabled}
        aria-label="Upload file input"
      />

      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowseClick}
          onKeyDown={handleKeyDown}
          tabIndex={disabled ? -1 : 0}
          role="button"
          aria-label="Drag and drop a file or browse files"
          className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer select-none outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
            isDragOver
              ? 'border-accent bg-accent/10 shadow-glow'
              : 'border-border hover:border-border-strong bg-card/60 hover:bg-card'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface border border-border text-accent mb-4 transition-transform group-hover:scale-105">
            <UploadCloud className="h-8 w-8 text-accent animate-pulse" />
          </div>

          <h3 className="text-lg font-bold text-text-primary tracking-tight">
            Drop your file here, or{' '}
            <span className="text-accent underline underline-offset-4">browse</span>
          </h3>

          <p className="mt-2 text-sm text-text-secondary max-w-sm mx-auto">
            Files up to <strong className="text-text-primary">1 GiB</strong> free without registration.
            Registered accounts unlock up to <strong className="text-text-primary">10 GiB</strong>.
          </p>

          <div className="mt-6 flex items-center justify-center space-x-4 text-xs text-text-muted">
            <span className="flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-status-success mr-1.5" />
              Automated expiry
            </span>
            <span className="flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-accent mr-1.5" />
              Optional password
            </span>
            <span className="flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-status-info mr-1.5" />
              Dual-token security
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div className="p-3 rounded-xl bg-surface border border-border text-accent mt-0.5">
                <FileIcon className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-text-primary break-all max-w-md">
                  {selectedFile.name}
                </h4>
                <div className="flex items-center space-x-3 mt-1 text-xs text-text-secondary">
                  <span>{formatBytes(selectedFile.size)}</span>
                  <span>&bull;</span>
                  <span className="uppercase">{selectedFile.name.split('.').pop() || 'FILE'}</span>
                  <span>&bull;</span>
                  <span>{selectedFile.type || 'application/octet-stream'}</span>
                </div>
              </div>
            </div>

            {!disabled && (
              <button
                type="button"
                onClick={onFileRemove}
                className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface rounded-lg transition-colors"
                title="Remove selected file"
                aria-label="Remove selected file"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Authentication Prompt if File > 1 GiB for Anonymous User */}
          {requiresAuth && (
            <div className="mt-4 p-4 rounded-xl bg-status-warning/10 border border-status-warning/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-status-warning text-sm">
              <div className="flex items-start space-x-2.5">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-status-warning" />
                <div>
                  <p className="font-semibold text-text-primary">
                    Authentication Required for &gt; 1 GiB Uploads
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Anonymous uploads are strictly capped at 1 GiB (1,073,741,824 bytes). Sign in or register to upload files up to 10 GiB.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <Link href="/login" className="w-full sm:w-auto">
                  <Button variant="secondary" size="sm" className="w-full">
                    Sign In
                  </Button>
                </Link>
                <Link href="/register" className="w-full sm:w-auto">
                  <Button variant="primary" size="sm" className="w-full">
                    Register
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
