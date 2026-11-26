'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Download,
  Lock,
  AlertCircle,
  FileText,
  CheckCircle2,
  Eye,
  EyeOff,
  Clock,
  ShieldAlert,
  Ban,
  FileQuestion,
  RefreshCw,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { ApiClient, ApiRequestError, PublicShareLinkMetadata } from '@/lib/api';

type LinkErrorKind =
  | 'not_found'
  | 'revoked'
  | 'expired'
  | 'limit_reached'
  | 'unavailable'
  | 'network';

interface MappedLinkError {
  kind: LinkErrorKind;
  title: string;
  message: string;
  retryable: boolean;
}

function mapMetadataError(err: unknown): MappedLinkError {
  if (err instanceof ApiRequestError) {
    const msg = err.message.toLowerCase();
    if (err.statusCode === 404) {
      return {
        kind: 'not_found',
        title: 'Share Link Not Found',
        message: 'This share link does not exist or may have been typed incorrectly.',
        retryable: false,
      };
    }
    if (err.statusCode === 403 || msg.includes('revoked')) {
      return {
        kind: 'revoked',
        title: 'Share Link Revoked',
        message: 'The owner has revoked access to this share link.',
        retryable: false,
      };
    }
    if (err.statusCode === 410) {
      if (msg.includes('limit')) {
        return {
          kind: 'limit_reached',
          title: 'Download Limit Reached',
          message: 'This share link has reached its maximum number of permitted downloads.',
          retryable: false,
        };
      }
      if (msg.includes('expired')) {
        return {
          kind: 'expired',
          title: 'Share Link Expired',
          message: 'This share link has passed its expiration time and is no longer available.',
          retryable: false,
        };
      }
      return {
        kind: 'unavailable',
        title: 'File No Longer Available',
        message: 'The shared file has expired or is no longer available for download.',
        retryable: false,
      };
    }
    return {
      kind: 'network',
      title: 'Unable to Load File',
      message: 'A server error occurred while checking this share link. Please try again.',
      retryable: true,
    };
  }

  return {
    kind: 'network',
    title: 'Connection Error',
    message: 'Could not reach the server. Please check your network connection and try again.',
    retryable: true,
  };
}

function mapDownloadError(err: unknown): { message: string; isTerminalLinkError: boolean } {
  if (err instanceof ApiRequestError) {
    const msg = err.message.toLowerCase();
    if (err.statusCode === 401) {
      if (msg.includes('incorrect')) {
        return { message: 'Incorrect password. Please check your passcode and try again.', isTerminalLinkError: false };
      }
      return { message: 'Password required to download this file.', isTerminalLinkError: false };
    }
    if (err.statusCode === 429) {
      return {
        message: 'Too many failed password attempts. Please wait a few minutes before trying again.',
        isTerminalLinkError: false,
      };
    }
    if (err.statusCode === 403 || err.statusCode === 404 || err.statusCode === 410) {
      return { message: err.message, isTerminalLinkError: true };
    }
    if (err.statusCode === 0) {
      return { message: err.message, isTerminalLinkError: false };
    }
    return { message: 'Download failed due to a server error. Please try again.', isTerminalLinkError: false };
  }

  return {
    message: 'Network interruption during download. Please check your connection and retry.',
    isTerminalLinkError: false,
  };
}

export default function SharePage() {
  const params = useParams();
  const shortCode = typeof params?.shortCode === 'string' ? params.shortCode : '';

  const [metadata, setMetadata] = useState<PublicShareLinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<MappedLinkError | null>(null);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const fetchMetadata = useCallback(async () => {
    if (!shortCode) return;
    try {
      setLoading(true);
      setLinkError(null);
      const data = await ApiClient.getPublicShareInfo(shortCode);
      setMetadata(data);
    } catch (err) {
      setMetadata(null);
      setLinkError(mapMetadataError(err));
    } finally {
      setLoading(false);
    }
  }, [shortCode]);

  useEffect(() => {
    void fetchMetadata();
  }, [fetchMetadata]);

  // Determine whether UI should permit initiating a download based on metadata
  const isMetadataExpired = Boolean(
    metadata?.expiresAt && new Date(metadata.expiresAt).getTime() <= Date.now()
  );
  const isMetadataLimitReached = Boolean(
    metadata?.maxDownloads !== null &&
      metadata?.maxDownloads !== undefined &&
      metadata.remainingDownloads !== null &&
      metadata.remainingDownloads <= 0
  );
  const canDownload = Boolean(metadata && !isMetadataExpired && !isMetadataLimitReached);

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metadata || downloading || !canDownload) return;

    if (metadata.hasPassword && !password) {
      setDownloadError('Please enter the password to download this file.');
      return;
    }

    setDownloadError(null);
    setDownloadSuccess(false);
    setDownloading(true);

    try {
      if (metadata.hasPassword) {
        await ApiClient.verifySharePassword(shortCode, password);
      }

      ApiClient.triggerBrowserDownload(shortCode, {
        password: password || undefined,
        fallbackFilename: metadata.originalName,
      });

      // Clear password from component state after submitting native form download
      setPassword('');
      setShowPassword(false);
      setDownloadSuccess(true);

      // Refresh metadata shortly after browser initiates the download
      setTimeout(() => {
        void fetchMetadata();
      }, 600);
    } catch (err) {
      const mapped = mapDownloadError(err);
      setDownloadError(mapped.message);
      if (mapped.isTerminalLinkError) {
        setPassword('');
        void fetchMetadata();
      }
    } finally {
      setDownloading(false);
    }
  };

  const formatBytes = (bytesStr: string) => {
    const bytes = Number(bytesStr);
    if (isNaN(bytes) || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const renderErrorIcon = (kind: LinkErrorKind) => {
    switch (kind) {
      case 'not_found':
        return <FileQuestion className="h-8 w-8 text-text-muted" />;
      case 'revoked':
        return <Ban className="h-8 w-8 text-status-error" />;
      case 'expired':
      case 'limit_reached':
        return <Clock className="h-8 w-8 text-status-warning" />;
      default:
        return <ShieldAlert className="h-8 w-8 text-status-error" />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col justify-between">
      <Navbar />

      <main className="max-w-xl mx-auto px-4 py-12 sm:py-16 flex-1 flex flex-col justify-center w-full">
        <Card variant="default" padding="none" className="overflow-hidden border-border">
          {/* Header */}
          <div className="bg-surface px-6 py-5 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="bg-primary/20 p-2 rounded-lg text-accent flex-shrink-0">
                <FileText className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-text-primary truncate">
                  Shared File
                </h1>
                <p className="text-xs text-text-muted font-mono truncate">Code: {shortCode}</p>
              </div>
            </div>
            {metadata?.hasPassword && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-status-warning/15 text-status-warning border border-status-warning/30 flex-shrink-0">
                <Lock className="w-3 h-3 mr-1" />
                Password Protected
              </span>
            )}
          </div>

          <div className="p-6 space-y-6">
            {loading && (
              <div className="text-center py-12 text-text-secondary">
                <Spinner size="lg" label="Checking share link validity..." />
              </div>
            )}

            {!loading && linkError && (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center">
                  {renderErrorIcon(linkError.kind)}
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-base font-bold text-text-primary">{linkError.title}</h2>
                  <p className="text-xs sm:text-sm text-text-secondary max-w-sm mx-auto">
                    {linkError.message}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  {linkError.retryable && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void fetchMetadata()}
                      leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                    >
                      Try Again
                    </Button>
                  )}
                  <Link href="/">
                    <Button variant="primary" size="sm">
                      Upload a File
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {!loading && metadata && (
              <>
                {/* File Details */}
                <div className="bg-surface rounded-lg p-4 border border-border space-y-2.5">
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-xs font-semibold text-text-muted uppercase">Filename</span>
                    <span
                      className="text-sm font-medium text-text-primary truncate max-w-[260px]"
                      title={metadata.originalName}
                    >
                      {metadata.originalName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-xs font-semibold text-text-muted uppercase">Size</span>
                    <span className="text-sm font-mono text-text-secondary">
                      {formatBytes(metadata.sizeBytes)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-xs font-semibold text-text-muted uppercase">Type</span>
                    <span className="text-sm text-text-secondary truncate max-w-[240px]">
                      {metadata.mimeType}
                    </span>
                  </div>
                  {metadata.expiresAt && (
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-xs font-semibold text-text-muted uppercase">
                        Expires
                      </span>
                      <span className="text-sm text-text-secondary">
                        {new Date(metadata.expiresAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {metadata.maxDownloads !== null && (
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-xs font-semibold text-text-muted uppercase">
                        Downloads Remaining
                      </span>
                      <span className="text-sm font-semibold text-accent font-mono">
                        {metadata.remainingDownloads ?? 0} / {metadata.maxDownloads}
                      </span>
                    </div>
                  )}
                </div>

                {downloadSuccess && (
                  <div className="rounded-lg bg-status-success/15 p-3 border border-status-success/30 text-xs sm:text-sm text-status-success flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <span>File download started successfully.</span>
                  </div>
                )}

                {downloadError && (
                  <div
                    role="alert"
                    className="rounded-lg bg-status-error/15 p-3 border border-status-error/30 text-xs sm:text-sm text-status-error flex items-start space-x-2"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-status-error" />
                    <span>{downloadError}</span>
                  </div>
                )}

                {!canDownload ? (
                  <div className="rounded-lg bg-status-warning/15 p-3 border border-status-warning/30 text-xs sm:text-sm text-status-warning flex items-start space-x-2">
                    <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      {isMetadataExpired
                        ? 'This share link has expired and can no longer be downloaded.'
                        : 'This share link has reached its download limit.'}
                    </span>
                  </div>
                ) : (
                  <form onSubmit={handleDownload} className="space-y-4">
                    {metadata.hasPassword && (
                      <Input
                        label="Passcode Required"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="off"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (downloadError) setDownloadError(null);
                        }}
                        placeholder="Enter share passcode"
                        disabled={downloading}
                        leftIcon={<Lock className="h-4 w-4" />}
                        rightIcon={
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="text-text-muted hover:text-text-primary focus:outline-none"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            tabIndex={0}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        }
                      />
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      isLoading={downloading}
                      disabled={downloading}
                      className="w-full"
                      leftIcon={<Download className="h-4 w-4" />}
                    >
                      {downloading ? 'Starting Download...' : 'Download File'}
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
