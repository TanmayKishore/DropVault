'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { UserVaultFile } from '@/contexts/UserVaultContext';
import { ApiClient } from '@/lib/api';
import {
  Download,
  Trash2,
  Share2,
  Calendar,
  Clock,
  HardDrive,
  FileText,
  AlertTriangle,
} from 'lucide-react';

interface FileDetailsModalProps {
  file: UserVaultFile | null;
  isOpen: boolean;
  onClose: () => void;
  onCreateShareLink: (file: UserVaultFile) => void;
  onDeleteFile: (fileId: string) => Promise<void>;
}

export const FileDetailsModal: React.FC<FileDetailsModalProps> = ({
  file,
  isOpen,
  onClose,
  onCreateShareLink,
  onDeleteFile,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!file) return null;

  const formatBytes = (bytesStr: string) => {
    const bytes = Number(bytesStr);
    if (isNaN(bytes) || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const handleDownload = async () => {
    setActionError(null);
    setIsDownloading(true);
    try {
      await ApiClient.downloadOwnerFile(file.id, file.originalName);
    } catch (err: any) {
      setActionError(err.message || 'Failed to download file');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    setActionError(null);
    setIsDeleting(true);
    try {
      await onDeleteFile(file.id);
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete file');
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="File Details & Management"
      description="Inspect metadata, download original file, or manage sharing."
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          {confirmDelete ? (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-status-error font-medium">Delete permanently?</span>
              <Button
                variant="danger"
                size="sm"
                isLoading={isDeleting}
                onClick={handleDelete}
              >
                Yes, Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isDeleting}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setConfirmDelete(true)}
              disabled={file.status === 'DELETED'}
            >
              Delete File
            </Button>
          )}

          <div className="flex items-center space-x-2">
            {file.status === 'AVAILABLE' && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download className="h-3.5 w-3.5" />}
                isLoading={isDownloading}
                onClick={handleDownload}
              >
                Download
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => onCreateShareLink(file)}>
              Create Share Link
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {actionError && (
          <div className="p-3 rounded-lg bg-status-error/15 border border-status-error/30 text-xs text-status-error flex items-start space-x-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-status-error" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Main Info */}
        <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-surface border border-border text-xs">
          <div>
            <span className="text-text-muted uppercase font-medium">Original Filename</span>
            <p className="text-text-primary font-semibold truncate mt-0.5" title={file.originalName}>
              {file.originalName}
            </p>
          </div>
          <div>
            <span className="text-text-muted uppercase font-medium">File Size</span>
            <p className="text-text-primary font-semibold mt-0.5">{formatBytes(file.sizeBytes)}</p>
          </div>
          <div>
            <span className="text-text-muted uppercase font-medium">Format / MIME Type</span>
            <p className="text-text-secondary mt-0.5">{file.mimeType || 'application/octet-stream'}</p>
          </div>
          <div>
            <span className="text-text-muted uppercase font-medium">Vault Status</span>
            <p className="mt-0.5">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  file.status === 'AVAILABLE'
                    ? 'bg-status-success/15 text-status-success'
                    : file.status === 'EXPIRED'
                    ? 'bg-status-warning/15 text-status-warning'
                    : 'bg-status-error/15 text-status-error'
                }`}
              >
                {file.status}
              </span>
            </p>
          </div>
          <div>
            <span className="text-text-muted uppercase font-medium">Uploaded At</span>
            <p className="text-text-secondary mt-0.5">{new Date(file.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-text-muted uppercase font-medium">File Expiry</span>
            <p className="text-text-secondary mt-0.5">{new Date(file.expiresAt).toLocaleString()}</p>
          </div>
        </div>

        {/* Share Links Associated with this file */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
              Associated Share Links ({file.shareLinks?.length || 0})
            </h4>
          </div>

          {!file.shareLinks || file.shareLinks.length === 0 ? (
            <p className="text-xs text-text-muted py-2">
              No public share links generated for this file yet.
            </p>
          ) : (
            <div className="rounded-lg border border-border bg-surface/40 divide-y divide-border/60 max-h-48 overflow-y-auto">
              {file.shareLinks.map((link) => (
                <div key={link.shortCode} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono text-accent font-semibold">{link.shortCode}</span>
                    <div className="flex items-center space-x-2 text-[11px] text-text-muted mt-0.5">
                      <span>Downloads: {link.downloadCount}{link.maxDownloads ? ` / ${link.maxDownloads}` : ''}</span>
                      <span>&bull;</span>
                      <span>{link.isRevoked ? 'Revoked' : 'Active'}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      link.isRevoked
                        ? 'bg-status-error/15 text-status-error'
                        : 'bg-status-success/15 text-status-success'
                    }`}
                  >
                    {link.isRevoked ? 'REVOKED' : 'ACTIVE'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
