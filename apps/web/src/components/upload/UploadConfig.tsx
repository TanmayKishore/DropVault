'use client';

import React, { useState } from 'react';
import { Clock, Lock, Sliders, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/Input';

interface UploadConfigProps {
  expiryDays: number;
  onExpiryDaysChange: (days: number) => void;
  password: string;
  onPasswordChange: (pass: string) => void;
  maxDownloads: string;
  onMaxDownloadsChange: (downloads: string) => void;
  disabled?: boolean;
}

export const UploadConfig: React.FC<UploadConfigProps> = ({
  expiryDays,
  onExpiryDaysChange,
  password,
  onPasswordChange,
  maxDownloads,
  onMaxDownloadsChange,
  disabled = false,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-5 mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-text-primary">Expiry Period</span>
        </div>
        <div className="flex items-center space-x-1.5 bg-surface p-1 rounded-lg border border-border">
          {[1, 3, 7, 30].map((days) => (
            <button
              key={days}
              type="button"
              disabled={disabled}
              onClick={() => onExpiryDaysChange(days)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                expiryDays === days
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              } disabled:opacity-50`}
            >
              {days === 1 ? '24 Hours' : `${days} Days`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center space-x-1.5 text-xs font-medium text-accent hover:underline transition-colors"
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>{showAdvanced ? 'Hide Link Protection Settings' : 'Add Password & Download Limits'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Password Protection (Optional)"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Enter passcode..."
              helperText="Requires recipient to input passcode before downloading."
              leftIcon={<Lock className="h-4 w-4 text-text-muted" />}
              disabled={disabled}
            />

            <Input
              label="Download Limit (Optional)"
              type="number"
              min="1"
              max="1000"
              value={maxDownloads}
              onChange={(e) => onMaxDownloadsChange(e.target.value)}
              placeholder="e.g. 5"
              helperText="Link automatically revokes after N successful downloads."
              leftIcon={<ShieldCheck className="h-4 w-4 text-text-muted" />}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </div>
  );
};
