import React from 'react';
import { File, Clock, HardDrive, Lock } from 'lucide-react';
import { Card } from '../ui/Card';

export interface FileInfoCardProps {
  filename: string;
  sizeBytes: string | number;
  mimeType?: string;
  expiresAt?: string | Date | null;
  hasPassword?: boolean;
  className?: string;
  action?: React.ReactNode;
}

export const FileInfoCard: React.FC<FileInfoCardProps> = ({
  filename,
  sizeBytes,
  mimeType,
  expiresAt,
  hasPassword,
  className = '',
  action,
}) => {
  const formatSize = (bytes: string | number) => {
    const num = Number(bytes);
    if (isNaN(num) || num === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return `${(num / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <Card variant="default" padding="sm" className={`flex items-center justify-between gap-4 ${className}`}>
      <div className="flex items-center space-x-3.5 min-w-0">
        <div className="p-2.5 bg-surface rounded-md border border-border text-accent flex-shrink-0">
          <File className="w-5 h-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center space-x-2">
            <h4 className="text-sm font-semibold text-text-primary truncate max-w-[200px] sm:max-w-xs md:max-w-md">
              {filename}
            </h4>
            {hasPassword && (
              <span className="p-1 rounded bg-status-warning/10 text-status-warning text-[10px] inline-flex items-center">
                <Lock className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
            <span className="inline-flex items-center space-x-1">
              <HardDrive className="w-3 h-3 text-text-muted" />
              <span>{formatSize(sizeBytes)}</span>
            </span>
            {mimeType && <span className="text-text-muted">• {mimeType}</span>}
            {expiresAt && (
              <span className="inline-flex items-center space-x-1">
                <Clock className="w-3 h-3 text-text-muted" />
                <span>Expires: {new Date(expiresAt).toLocaleDateString()}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </Card>
  );
};
