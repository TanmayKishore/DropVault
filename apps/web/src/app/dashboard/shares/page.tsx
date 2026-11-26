'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useUserVault, UserShareLinkSummary } from '@/contexts/UserVaultContext';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Search,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function ShareLinksPage() {
  const {
    shareLinks,
    sharesPagination,
    isSharesLoading,
    sharesError,
    refreshShares,
    revokeShareLink,
    setSharesPage,
    setSharesSearchQuery,
    currentSharesSearchQuery,
  } = useUserVault();

  const [searchInput, setSearchInput] = useState(currentSharesSearchQuery);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [linkToRevoke, setLinkToRevoke] = useState<UserShareLinkSummary | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const copyToClipboard = async (url: string, shortCode: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(shortCode);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Ignore
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSharesSearchQuery(searchInput);
  };

  const handleConfirmRevoke = async () => {
    if (!linkToRevoke) return;
    setRevokeError(null);
    setIsRevoking(true);

    try {
      await revokeShareLink(linkToRevoke.fileId, linkToRevoke.id, linkToRevoke.shortCode);
      setLinkToRevoke(null);
    } catch (err: any) {
      setRevokeError(err.message || 'Failed to revoke share link');
    } finally {
      setIsRevoking(false);
    }
  };

  const getLinkStatus = (link: UserShareLinkSummary): { label: string; style: string } => {
    if (link.isRevoked) {
      return { label: 'REVOKED', style: 'bg-status-error/15 text-status-error' };
    }
    const now = new Date();
    if (link.fileStatus && link.fileStatus !== 'AVAILABLE') {
      return { label: 'UNAVAILABLE', style: 'bg-status-error/15 text-status-error' };
    }
    if (link.fileExpiresAt && new Date(link.fileExpiresAt) < now) {
      return { label: 'EXPIRED', style: 'bg-status-warning/15 text-status-warning' };
    }
    if (link.expiresAt && new Date(link.expiresAt) < now) {
      return { label: 'EXPIRED', style: 'bg-status-warning/15 text-status-warning' };
    }
    if (link.maxDownloads && link.downloadCount >= link.maxDownloads) {
      return { label: 'LIMIT REACHED', style: 'bg-status-warning/15 text-status-warning' };
    }
    return { label: 'ACTIVE', style: 'bg-status-success/15 text-status-success' };
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Share Links</h1>
          <p className="text-sm text-text-secondary mt-1">
            Monitor, copy, and revoke public download links created across your files.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => void refreshShares()}
            disabled={isSharesLoading}
            className="p-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            title="Refresh links"
            aria-label="Refresh links"
          >
            <RefreshCw className={`h-4 w-4 ${isSharesLoading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/dashboard/files">
            <Button variant="secondary" size="sm">
              View Files
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 max-w-sm w-full">
          <Input
            placeholder="Search links by code or filename..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
          <Button variant="secondary" size="md" type="submit">
            Search
          </Button>
        </form>
        <span className="text-xs text-text-muted whitespace-nowrap">
          Showing {shareLinks.length} of {sharesPagination.total} link
          {sharesPagination.total === 1 ? '' : 's'}
        </span>
      </div>

      {/* Main Table */}
      {isSharesLoading ? (
        <div className="text-center py-16 text-text-secondary">
          <Spinner size="lg" label="Loading share links..." />
        </div>
      ) : sharesError ? (
        <div className="p-4 rounded-xl bg-status-error/15 border border-status-error/30 text-status-error text-xs">
          {sharesError}
        </div>
      ) : shareLinks.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-card/40">
          <Share2 className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-text-primary">
            {currentSharesSearchQuery ? 'No matching share links found' : 'No share links created yet'}
          </h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1 mb-4">
            {currentSharesSearchQuery
              ? 'Try adjusting your search terms.'
              : 'Share links will appear here after you upload files or create new links in My Files.'}
          </p>
          {!currentSharesSearchQuery && (
            <Link href="/dashboard/files">
              <Button variant="primary" size="sm">
                Go to My Files
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
                  <th className="px-4 py-3">Short Code</th>
                  <th className="px-4 py-3">Associated File</th>
                  <th className="px-4 py-3">Downloads</th>
                  <th className="px-4 py-3">Security</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {shareLinks.map((link) => {
                  const statusInfo = getLinkStatus(link);
                  return (
                    <tr key={link.id || link.shortCode} className="hover:bg-surface/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-accent">
                        {link.shortCode}
                      </td>
                      <td className="px-4 py-3 font-medium text-text-primary max-w-xs truncate">
                        {link.fileName}
                      </td>
                      <td className="px-4 py-3 text-text-secondary font-mono">
                        {link.downloadCount}
                        {link.maxDownloads ? ` / ${link.maxDownloads}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        {link.hasPassword ? (
                          <span className="inline-flex items-center text-status-warning text-[11px] font-medium">
                            <Lock className="h-3 w-3 mr-1" />
                            Password
                          </span>
                        ) : (
                          <span className="text-text-muted text-[11px]">Public</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusInfo.style}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <button
                          onClick={() => copyToClipboard(link.shareUrl, link.shortCode)}
                          className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-surface"
                          title="Copy share URL"
                        >
                          {copiedCode === link.shortCode ? (
                            <Check className="h-3.5 w-3.5 text-status-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <a
                          href={link.shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-surface"
                          title="Open link"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {!link.isRevoked && (
                          <button
                            onClick={() => {
                              setRevokeError(null);
                              setLinkToRevoke(link);
                            }}
                            className="p-1.5 text-text-muted hover:text-status-error rounded-md hover:bg-surface"
                            title="Revoke link"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {sharesPagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border bg-surface/30 flex items-center justify-between">
              <span className="text-xs text-text-muted">
                Page {sharesPagination.page} of {sharesPagination.totalPages}
              </span>
              <div className="flex items-center space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSharesPage(Math.max(sharesPagination.page - 1, 1))}
                  disabled={sharesPagination.page <= 1}
                  leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setSharesPage(Math.min(sharesPagination.page + 1, sharesPagination.totalPages))
                  }
                  disabled={sharesPagination.page >= sharesPagination.totalPages}
                  rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revocation Confirmation Modal */}
      <Modal
        isOpen={Boolean(linkToRevoke)}
        onClose={() => {
          if (!isRevoking) setLinkToRevoke(null);
        }}
        title="Revoke Share Link"
        description={`Are you sure you want to revoke the link (${linkToRevoke?.shortCode})?`}
        size="md"
        footer={
          <div className="flex items-center justify-end space-x-2 w-full">
            <Button
              variant="ghost"
              size="sm"
              disabled={isRevoking}
              onClick={() => setLinkToRevoke(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={isRevoking}
              onClick={handleConfirmRevoke}
            >
              Yes, Revoke Link
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-text-secondary">
          {revokeError && (
            <div className="p-3 rounded-lg bg-status-error/15 border border-status-error/30 text-status-error">
              {revokeError}
            </div>
          )}
          <p>
            Revoking this share link immediately prevents anyone with the URL from downloading the
            file.
          </p>
          <div className="p-3 rounded-lg bg-surface border border-border text-[11px] space-y-1">
            <div className="flex justify-between">
              <span className="text-text-muted">Target File:</span>
              <span className="font-semibold text-text-primary">{linkToRevoke?.fileName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Link Code:</span>
              <span className="font-mono text-accent">{linkToRevoke?.shortCode}</span>
            </div>
          </div>
          <p className="text-text-muted text-[11px]">
            <strong>Note:</strong> Revoking a share link does <em>not</em> delete the underlying file
            from your vault.
          </p>
        </div>
      </Modal>
    </div>
  );
}
