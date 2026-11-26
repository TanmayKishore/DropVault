'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useUserVault } from '@/contexts/UserVaultContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import {
  HardDrive,
  Share2,
  Clock,
  ArrowRight,
  UploadCloud,
  FileCheck2,
  RefreshCw,
} from 'lucide-react';

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const { files, metrics, isLoading, refreshVault } = useUserVault();

  const formatBytes = (bytesStr: string) => {
    const bytes = Number(bytesStr);
    if (isNaN(bytes) || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const recentFiles = files.slice(0, 5);

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Welcome back, {user?.name || user?.email?.split('@')[0] || 'User'}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage your ephemeral vault files and secure share links.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => void refreshVault()}
            disabled={isLoading}
            className="p-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            title="Refresh vault"
            aria-label="Refresh vault"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/">
            <Button variant="primary" size="md" rightIcon={<UploadCloud className="h-4 w-4" />}>
              Upload New File
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Row (Derived directly from account-wide backend metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" className="p-5 border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted uppercase">Total Uploads</span>
            <HardDrive className="h-4 w-4 text-accent" />
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-7 w-12 bg-surface rounded animate-pulse" />
            ) : (
              <span className="text-2xl font-bold font-mono text-text-primary">{metrics.totalFiles}</span>
            )}
            <p className="text-[11px] text-text-muted mt-0.5">Files uploaded to vault</p>
          </div>
        </Card>

        <Card variant="default" className="p-5 border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted uppercase">Available Files</span>
            <FileCheck2 className="h-4 w-4 text-status-success" />
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-7 w-12 bg-surface rounded animate-pulse" />
            ) : (
              <span className="text-2xl font-bold font-mono text-status-success">
                {metrics.availableFiles}
              </span>
            )}
            <p className="text-[11px] text-text-muted mt-0.5">Active &amp; ready to stream</p>
          </div>
        </Card>

        <Card variant="default" className="p-5 border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted uppercase">Active Share Links</span>
            <Share2 className="h-4 w-4 text-accent" />
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-7 w-12 bg-surface rounded animate-pulse" />
            ) : (
              <span className="text-2xl font-bold font-mono text-text-primary">
                {metrics.activeShareLinks}
              </span>
            )}
            <p className="text-[11px] text-text-muted mt-0.5">Public links distributed</p>
          </div>
        </Card>

        <Card variant="default" className="p-5 border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted uppercase">Expired / Purged</span>
            <Clock className="h-4 w-4 text-text-muted" />
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-7 w-12 bg-surface rounded animate-pulse" />
            ) : (
              <span className="text-2xl font-bold font-mono text-text-secondary">
                {metrics.expiredFiles}
              </span>
            )}
            <p className="text-[11px] text-text-muted mt-0.5">TTL cleaned objects</p>
          </div>
        </Card>
      </div>

      {/* Recent Files Table / List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Recent Uploads</h2>
          <Link
            href="/dashboard/files"
            className="text-xs font-medium text-accent hover:underline flex items-center space-x-1"
          >
            <span>View All Files</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-text-secondary">
            <Spinner size="md" label="Loading recent uploads..." />
          </div>
        ) : recentFiles.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-border bg-card/50">
            <HardDrive className="h-8 w-8 text-text-muted mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-text-primary">No files in your vault</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1 mb-4">
              Upload your first file on the landing page to start sharing securely.
            </p>
            <Link href="/">
              <Button variant="primary" size="sm">
                Upload a File
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface/50 border-b border-border text-text-muted uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Filename</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-text-primary max-w-xs truncate">
                      {file.originalName}
                    </td>
                    <td className="px-4 py-3 text-text-secondary font-mono">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {new Date(file.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href="/dashboard/files"
                        className="text-xs text-accent hover:underline font-medium"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
