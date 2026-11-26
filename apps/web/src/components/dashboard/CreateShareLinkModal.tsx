'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { UserVaultFile } from '@/contexts/UserVaultContext';
import { Lock, ShieldCheck, Copy, Check, ExternalLink, AlertCircle, Clock } from 'lucide-react';

interface CreateShareLinkModalProps {
  file: UserVaultFile | null;
  isOpen: boolean;
  onClose: () => void;
  onCreateLink: (
    fileId: string,
    params: { password?: string; expiresAt?: string; maxDownloads?: number }
  ) => Promise<{ shortCode: string; shareUrl: string }>;
}

export const CreateShareLinkModal: React.FC<CreateShareLinkModalProps> = ({
  file,
  isOpen,
  onClose,
  onCreateLink,
}) => {
  const [password, setPassword] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [expiryOption, setExpiryOption] = useState<string>('same'); // 'same' | '24h' | '3d' | '7d' | '30d'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{ shortCode: string; shareUrl: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  if (!file) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate password length if provided
    if (password && password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    // Compute expiresAt based on selected expiryOption
    let expiresAt: string | undefined = undefined;
    const fileExpiryTime = new Date(file.expiresAt).getTime();
    const now = Date.now();

    if (expiryOption !== 'same') {
      let durationMs = 24 * 60 * 60 * 1000;
      if (expiryOption === '3d') durationMs = 3 * 24 * 60 * 60 * 1000;
      else if (expiryOption === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;
      else if (expiryOption === '30d') durationMs = 30 * 24 * 60 * 60 * 1000;

      const requestedTime = now + durationMs;
      // Cap at file expiration
      const finalExpiryTime = Math.min(requestedTime, fileExpiryTime);
      expiresAt = new Date(finalExpiryTime).toISOString();
    }

    setLoading(true);

    try {
      const parsedMax = maxDownloads ? parseInt(maxDownloads, 10) : undefined;
      const res = await onCreateLink(file.id, {
        password: password || undefined,
        expiresAt,
        maxDownloads: parsedMax,
      });
      setCreatedResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to create share link');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!createdResult) return;
    try {
      await navigator.clipboard.writeText(createdResult.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleModalClose = () => {
    setPassword('');
    setMaxDownloads('');
    setExpiryOption('same');
    setError(null);
    setCreatedResult(null);
    setCopied(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title="Create New Share Link"
      description={`Generate a public download URL for "${file.originalName}".`}
      size="md"
    >
      {createdResult ? (
        <div className="space-y-4 py-2">
          <div className="p-3.5 bg-status-success/15 border border-status-success/30 rounded-xl text-status-success text-xs flex items-center space-x-2">
            <span>Share link created successfully!</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-muted uppercase">Shareable Link</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={createdResult.shareUrl}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 font-mono text-xs text-text-primary select-all focus:outline-none"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={copyToClipboard}
                leftIcon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <a
                href={createdResult.shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary"
                title="Open link"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="secondary" size="sm" onClick={handleModalClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-status-error/15 border border-status-error/30 text-xs text-status-error flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-status-error" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-muted uppercase flex items-center">
              <Clock className="h-3.5 w-3.5 mr-1.5 text-text-secondary" />
              Link Expiration
            </label>
            <select
              value={expiryOption}
              onChange={(e) => setExpiryOption(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
              disabled={loading}
            >
              <option value="same">Inherit File Expiry ({new Date(file.expiresAt).toLocaleDateString()})</option>
              <option value="24h">24 Hours</option>
              <option value="3d">3 Days</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days (Capped at file expiry)</option>
            </select>
            <p className="text-[11px] text-text-muted">
              Share link expiration cannot exceed the underlying file expiration.
            </p>
          </div>

          <Input
            label="Optional Password Protection (Min 6 chars)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters..."
            helperText="Recipients must enter this passcode before downloading."
            leftIcon={<Lock className="h-4 w-4" />}
            disabled={loading}
          />

          <Input
            label="Optional Download Limit"
            type="number"
            min="1"
            max="1000"
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(e.target.value)}
            placeholder="e.g. 5"
            helperText="Link will automatically revoke after N downloads."
            leftIcon={<ShieldCheck className="h-4 w-4" />}
            disabled={loading}
          />

          <div className="pt-3 flex justify-end space-x-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleModalClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={loading}>
              Create Link
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
