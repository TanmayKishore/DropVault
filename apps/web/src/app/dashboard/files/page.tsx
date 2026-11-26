'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useUserVault, UserVaultFile } from '@/contexts/UserVaultContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { FileDetailsModal } from '@/components/dashboard/FileDetailsModal';
import { CreateShareLinkModal } from '@/components/dashboard/CreateShareLinkModal';
import {
  HardDrive,
  Share2,
  Download,
  Search,
  RefreshCw,
  Plus,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function MyFilesPage() {
  const {
    files,
    isLoading,
    error,
    refreshVault,
    deleteFile,
    createShareLinkForFile,
    pagination,
    setPage,
    setStatusFilter,
    setSearchQuery,
    currentStatusFilter,
    currentSearchQuery,
  } = useUserVault();

  const [searchInput, setSearchInput] = useState(currentSearchQuery);
  const [selectedFileForDetails, setSelectedFileForDetails] = useState<UserVaultFile | null>(null);
  const [selectedFileForShare, setSelectedFileForShare] = useState<UserVaultFile | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const formatBytes = (bytesStr: string) => {
    const bytes = Number(bytesStr);
    if (isNaN(bytes) || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const handleDownload = async (file: UserVaultFile) => {
    setDownloadingId(file.id);
    try {
      await ApiClient.downloadOwnerFile(file.id, file.originalName);
    } catch (err: any) {
      alert(err.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">My Files</h1>
          <p className="text-sm text-text-secondary mt-1">
            Browse and manage files stored in your authenticated vault.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => void refreshVault()}
            disabled={isLoading}
            className="p-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            title="Refresh list"
            aria-label="Refresh list"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/">
            <Button variant="primary" size="sm" rightIcon={<Plus className="h-4 w-4" />}>
              Upload File
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 max-w-sm w-full">
          <Input
            placeholder="Search files by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
          <Button variant="secondary" size="md" type="submit">
            Search
          </Button>
        </form>

        <div className="flex items-center space-x-3">
          <select
            value={currentStatusFilter || ''}
            onChange={(e) =>
              setStatusFilter(
                (e.target.value as 'PENDING' | 'AVAILABLE' | 'EXPIRED' | 'DELETED' | 'FAILED') ||
                  undefined
              )
            }
            aria-label="Filter files by status"
            className="bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="EXPIRED">Expired</option>
            <option value="DELETED">Deleted</option>
            <option value="FAILED">Failed</option>
          </select>

          <span className="text-xs text-text-muted whitespace-nowrap">
            Showing {files.length} of {pagination.total} file{pagination.total === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Main Files Table */}
      {isLoading ? (
        <div className="text-center py-16 text-text-secondary">
          <Spinner size="lg" label="Loading vault files..." />
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-status-error/15 border border-status-error/30 text-status-error text-xs">
          {error}
        </div>
      ) : files.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-card/40">
          <HardDrive className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-text-primary">
            {currentSearchQuery || currentStatusFilter
              ? 'No matching files found'
              : 'Your vault is empty'}
          </h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1 mb-4">
            {currentSearchQuery || currentStatusFilter
              ? 'Try adjusting your search query or status filter.'
              : 'Upload a file from the landing page to start managing your secure shares.'}
          </p>
          {!currentSearchQuery && !currentStatusFilter && (
            <Link href="/">
              <Button variant="primary" size="sm">
                Upload File
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface/50 border-b border-border text-text-muted uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Filename</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-text-primary max-w-xs truncate">
                      {file.originalName}
                    </td>
                    <td className="px-4 py-3 text-text-secondary font-mono">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary truncate max-w-[120px]">
                      {file.mimeType}
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
                    <td className="px-4 py-3 text-text-muted">
                      {new Date(file.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        onClick={() => setSelectedFileForDetails(file)}
                        className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-surface"
                        title="File details"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                      {file.status === 'AVAILABLE' && (
                        <button
                          onClick={() => handleDownload(file)}
                          disabled={downloadingId === file.id}
                          className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-surface disabled:opacity-50"
                          title="Download file"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedFileForShare(file)}
                        className="p-1.5 text-accent hover:text-accent/80 rounded-md hover:bg-surface"
                        title="Create share link"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border bg-surface/30 flex items-center justify-between">
              <span className="text-xs text-text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(Math.max(pagination.page - 1, 1))}
                  disabled={pagination.page <= 1}
                  leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(Math.min(pagination.page + 1, pagination.totalPages))}
                  disabled={pagination.page >= pagination.totalPages}
                  rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <FileDetailsModal
        file={selectedFileForDetails}
        isOpen={Boolean(selectedFileForDetails)}
        onClose={() => setSelectedFileForDetails(null)}
        onCreateShareLink={(file) => {
          setSelectedFileForDetails(null);
          setSelectedFileForShare(file);
        }}
        onDeleteFile={deleteFile}
      />

      <CreateShareLinkModal
        file={selectedFileForShare}
        isOpen={Boolean(selectedFileForShare)}
        onClose={() => setSelectedFileForShare(null)}
        onCreateLink={createShareLinkForFile}
      />
    </div>
  );
}
