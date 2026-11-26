'use client';

import React, { useState } from 'react';
import { UploadResult } from '@/hooks/useUpload';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  CheckCircle2,
  Copy,
  Check,
  KeyRound,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  FileCheck,
} from 'lucide-react';
import Link from 'next/link';

interface UploadSuccessProps {
  result: UploadResult;
  onUploadAnother: () => void;
}

export const UploadSuccessView: React.FC<UploadSuccessProps> = ({
  result,
  onUploadAnother,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const copyToClipboard = async (text: string, type: 'link' | 'token') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      }
    } catch {
      // Fallback
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

  return (
    <Card variant="default" className="p-6 sm:p-8 space-y-6 border-border">
      {/* Header Banner */}
      <div className="flex items-center space-x-3.5 pb-5 border-b border-border">
        <div className="p-3 bg-status-success/15 border border-status-success/30 rounded-2xl text-status-success shadow-glow">
          <CheckCircle2 className="h-7 w-7 text-status-success" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-text-primary tracking-tight">
            Upload Successful
          </h3>
          <p className="text-sm text-text-secondary">
            Your file is safely stored and ready to share.
          </p>
        </div>
      </div>

      {/* Share URL Box */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider">
          Shareable Link
        </label>
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              readOnly
              value={result.shareUrl}
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 font-mono text-sm text-text-primary select-all focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => copyToClipboard(result.shareUrl, 'link')}
            leftIcon={copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          >
            {copiedLink ? 'Copied' : 'Copy'}
          </Button>
          <a
            href={result.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            title="Open link in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* File Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-surface border border-border text-xs">
        <div>
          <span className="text-text-muted uppercase font-medium">File Name</span>
          <p className="text-text-primary font-semibold truncate mt-0.5" title={result.originalName}>
            {result.originalName}
          </p>
        </div>
        <div>
          <span className="text-text-muted uppercase font-medium">Size</span>
          <p className="text-text-primary font-semibold mt-0.5">
            {formatBytes(result.sizeBytes)}
          </p>
        </div>
        <div>
          <span className="text-text-muted uppercase font-medium">Expires At</span>
          <p className="text-text-primary font-semibold mt-0.5">
            {new Date(result.expiresAt).toLocaleDateString()}
          </p>
        </div>
        <div>
          <span className="text-text-muted uppercase font-medium">Protection</span>
          <p className="text-text-primary font-semibold mt-0.5">
            {result.isPasswordProtected ? 'Password Locked' : 'Public'}
          </p>
        </div>
      </div>

      {/* Anonymous Management Token Notice (Strictly for anonymous uploads) */}
      {result.managementToken && (
        <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
          <div className="flex items-start space-x-2.5">
            <KeyRound className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-text-primary">
                Anonymous Management Token
              </h4>
              <p className="text-xs text-text-secondary mt-0.5">
                Because you uploaded anonymously, this token is your only proof of ownership to manage, delete, or revoke this file. Store it in a safe place.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="text"
              readOnly
              value={result.managementToken}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 font-mono text-xs text-text-secondary select-all focus:outline-none"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => copyToClipboard(result.managementToken!, 'token')}
              leftIcon={copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            >
              {copiedToken ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onUploadAnother}
          leftIcon={<FileCheck className="h-4 w-4" />}
          className="w-full sm:w-auto"
        >
          Upload Another File
        </Button>
        <Link href="/" className="w-full sm:w-auto">
          <Button variant="ghost" size="md" className="w-full sm:w-auto">
            Back to Home
          </Button>
        </Link>
      </div>
    </Card>
  );
};
