'use client';

import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, RefreshCw, Database } from 'lucide-react';

interface DatabaseHealth {
  status: 'connected' | 'disconnected';
  details?: string;
}

interface HealthData {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  database?: DatabaseHealth;
}

interface ApiResponse {
  success: boolean;
  data?: HealthData;
  error?: {
    message: string;
  };
}

export const BackendStatus: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [connected, setConnected] = useState<boolean>(false);
  const [data, setData] = useState<HealthData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const checkHealth = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch(`${apiUrl}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const json: ApiResponse = await response.json();
      if (json.success && json.data) {
        setConnected(true);
        setData(json.data);
      } else {
        throw new Error(json.error?.message || 'Unexpected response format');
      }
    } catch (err: unknown) {
      setConnected(false);
      setData(null);
      setErrorMsg(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void checkHealth();
  }, []);

  const isDbConnected = data?.database?.status === 'connected';

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm text-text-primary">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center space-x-2">
          <Activity className="h-5 w-5 text-accent" />
          <h3 className="font-semibold text-text-primary text-sm">System Connectivity</h3>
        </div>
        <button
          onClick={() => void checkHealth()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-text-secondary bg-surface hover:bg-surface/80 border border-border rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Check Now
        </button>
      </div>

      <div className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Backend API:</span>
          <span className="text-xs font-mono text-text-secondary">{apiUrl}/api/health</span>
        </div>

        {/* API Server Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border">
          <div className="flex items-center space-x-2.5">
            {loading ? (
              <div className="h-3 w-3 rounded-full bg-status-warning animate-pulse" />
            ) : connected ? (
              <CheckCircle2 className="h-4 w-4 text-status-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-status-error" />
            )}
            <div>
              <p className="text-xs font-medium text-text-primary">HTTP API Server</p>
              <p className="text-[11px] text-text-muted">
                {loading
                  ? 'Connecting to backend...'
                  : connected
                  ? `Online (v${data?.version || '1.0.0'})`
                  : errorMsg || 'Offline'}
              </p>
            </div>
          </div>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              loading
                ? 'bg-status-warning/10 text-status-warning'
                : connected
                ? 'bg-status-success/10 text-status-success'
                : 'bg-status-error/10 text-status-error'
            }`}
          >
            {loading ? 'CHECKING' : connected ? 'CONNECTED' : 'UNREACHABLE'}
          </span>
        </div>

        {/* Database Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border">
          <div className="flex items-center space-x-2.5">
            <Database className="h-4 w-4 text-text-muted" />
            <div>
              <p className="text-xs font-medium text-text-primary">PostgreSQL Database</p>
              <p className="text-[11px] text-text-muted">
                {loading
                  ? 'Verifying pool connection...'
                  : isDbConnected
                  ? 'Active connection pool'
                  : 'Disconnected'}
              </p>
            </div>
          </div>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              loading
                ? 'bg-status-warning/10 text-status-warning'
                : isDbConnected
                ? 'bg-status-success/10 text-status-success'
                : 'bg-status-error/10 text-status-error'
            }`}
          >
            {loading ? 'CHECKING' : isDbConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>

        {/* Technical Summary */}
        {connected && data && (
          <div className="mt-3 p-3 rounded-lg bg-surface/50 border border-border text-[11px] space-y-1 font-mono text-text-muted">
            <div className="flex justify-between">
              <span>Environment:</span>
              <span className="text-text-secondary">{data.environment}</span>
            </div>
            <div className="flex justify-between">
              <span>Uptime:</span>
              <span className="text-text-secondary">{Math.floor(data.uptime)} seconds</span>
            </div>
            <div className="flex justify-between">
              <span>Server Time:</span>
              <span className="text-text-secondary">{new Date(data.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
