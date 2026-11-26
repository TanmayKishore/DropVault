'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { User, Shield, Server } from 'lucide-react';

export default function DashboardSettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="pb-4 border-b border-border">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Account Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Review your account profile and authentication configuration.
        </p>
      </div>

      <Card variant="default" className="p-6 space-y-4 border-border">
        <div className="flex items-center space-x-3 pb-3 border-b border-border">
          <div className="p-2.5 rounded-xl bg-surface border border-border text-accent">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">User Profile</h3>
            <p className="text-xs text-text-secondary">Authentication credentials</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
          <div>
            <span className="text-text-muted uppercase font-medium">Email Address</span>
            <p className="font-medium text-text-primary mt-0.5">{user?.email || 'N/A'}</p>
          </div>
          <div>
            <span className="text-text-muted uppercase font-medium">Full Name</span>
            <p className="font-medium text-text-primary mt-0.5">{user?.name || 'Not provided'}</p>
          </div>
          <div>
            <span className="text-text-muted uppercase font-medium">Account Role</span>
            <p className="font-medium text-text-primary mt-0.5">{user?.role || 'USER'}</p>
          </div>
          <div>
            <span className="text-text-muted uppercase font-medium">Upload Limit Tier</span>
            <p className="font-medium text-accent mt-0.5">10 GiB (System-Configured Authenticated Limit)</p>
          </div>
        </div>
      </Card>

      <Card variant="default" className="p-6 space-y-4 border-border">
        <div className="flex items-center space-x-3 pb-3 border-b border-border">
          <div className="p-2.5 rounded-xl bg-surface border border-border text-accent">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Vault Security</h3>
            <p className="text-xs text-text-secondary">Active cryptographic protection</p>
          </div>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Your account uses Argon2id password hashing and rotating JWT access tokens with HTTP-only
          session refresh cookies. Uploaded files are partitioned by unguessable temporal storage keys
          and governed by automated TTL expiration cycles.
        </p>
      </Card>

      <Card variant="default" className="p-6 space-y-4 border-border">
        <div className="flex items-center space-x-3 pb-3 border-b border-border">
          <div className="p-2.5 rounded-xl bg-surface border border-border text-accent">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Storage Architecture</h3>
            <p className="text-xs text-text-secondary">Development &amp; production environments</p>
          </div>
        </div>
        <div className="space-y-2 text-xs text-text-secondary leading-relaxed">
          <p>
            • <strong>Local Development:</strong> Stored on protected local filesystem partitions isolated per service environment.
          </p>
          <p>
            • <strong>Production Architecture:</strong> Streamed to Amazon Web Services (AWS) S3 buckets utilizing AES-256 server-side encryption with strict bucket policies and secure pre-signed streams.
          </p>
        </div>
      </Card>
    </div>
  );
}
