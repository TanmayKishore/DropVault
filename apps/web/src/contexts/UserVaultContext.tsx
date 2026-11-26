'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ApiClient, FileMetadata } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export interface UserVaultFile extends FileMetadata {
  shareLinks?: Array<{
    id: string;
    shortCode: string;
    downloadCount: number;
    maxDownloads: number | null;
    isRevoked: boolean;
    expiresAt: string | null;
    hasPassword: boolean;
    createdAt?: string;
  }>;
}

export interface UserShareLinkSummary {
  id: string;
  fileId: string;
  fileName: string;
  fileSizeBytes: string;
  fileStatus?: 'PENDING' | 'AVAILABLE' | 'EXPIRED' | 'DELETED' | 'FAILED';
  fileExpiresAt?: string;
  shortCode: string;
  shareUrl: string;
  hasPassword: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  isRevoked: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface VaultMetrics {
  totalFiles: number;
  availableFiles: number;
  expiredFiles: number;
  activeShareLinks: number;
}

export interface VaultPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UserVaultContextType {
  files: UserVaultFile[];
  shareLinks: UserShareLinkSummary[];
  metrics: VaultMetrics;
  pagination: VaultPagination;
  sharesPagination: VaultPagination;
  isLoading: boolean;
  isSharesLoading: boolean;
  error: string | null;
  sharesError: string | null;
  refreshVault: () => Promise<void>;
  refreshShares: () => Promise<void>;
  setPage: (page: number) => void;
  setStatusFilter: (status: 'PENDING' | 'AVAILABLE' | 'EXPIRED' | 'DELETED' | 'FAILED' | undefined) => void;
  setSearchQuery: (query: string) => void;
  setSharesPage: (page: number) => void;
  setSharesSearchQuery: (query: string) => void;
  currentStatusFilter?: 'PENDING' | 'AVAILABLE' | 'EXPIRED' | 'DELETED' | 'FAILED';
  currentSearchQuery: string;
  currentSharesSearchQuery: string;
  deleteFile: (fileId: string) => Promise<void>;
  revokeShareLink: (fileId: string, shareLinkId: string, shortCode: string) => Promise<void>;
  createShareLinkForFile: (
    fileId: string,
    params: { password?: string; expiresAt?: string; maxDownloads?: number }
  ) => Promise<{ shortCode: string; shareUrl: string }>;
}

const UserVaultContext = createContext<UserVaultContextType | undefined>(undefined);

export const UserVaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [files, setFiles] = useState<UserVaultFile[]>([]);
  const [shareLinks, setShareLinks] = useState<UserShareLinkSummary[]>([]);
  const [metrics, setMetrics] = useState<VaultMetrics>({
    totalFiles: 0,
    availableFiles: 0,
    expiredFiles: 0,
    activeShareLinks: 0,
  });
  const [pagination, setPagination] = useState<VaultPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [sharesPagination, setSharesPagination] = useState<VaultPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [statusFilter, setStatusFilter] = useState<
    'PENDING' | 'AVAILABLE' | 'EXPIRED' | 'DELETED' | 'FAILED' | undefined
  >(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [sharesSearchQuery, setSharesSearchQuery] = useState<string>('');
  const [sharesPage, setSharesPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSharesLoading, setIsSharesLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sharesError, setSharesError] = useState<string | null>(null);

  // Fetch account-wide files directly from backend API
  const refreshVault = useCallback(async () => {
    if (!user || !isAuthenticated) {
      setFiles([]);
      setMetrics({
        totalFiles: 0,
        availableFiles: 0,
        expiredFiles: 0,
        activeShareLinks: 0,
      });
      setPagination({ page: 1, limit: 20, total: 0, totalPages: 1 });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await ApiClient.listFiles({
        page,
        limit: 20,
        status: statusFilter,
        search: searchQuery.trim() || undefined,
      });

      if (res.data) {
        setFiles(res.data.files as UserVaultFile[]);
        setPagination(res.data.pagination);
        setMetrics(res.data.metrics);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve vault files');
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated, page, statusFilter, searchQuery]);

  // Fetch account-wide share links independently of file-list pagination
  const refreshShares = useCallback(async () => {
    if (!user || !isAuthenticated) {
      setShareLinks([]);
      setSharesPagination({ page: 1, limit: 20, total: 0, totalPages: 1 });
      setIsSharesLoading(false);
      return;
    }

    setIsSharesLoading(true);
    setSharesError(null);

    try {
      const res = await ApiClient.listShareLinks({
        page: sharesPage,
        limit: 20,
        search: sharesSearchQuery.trim() || undefined,
      });

      if (res.data) {
        const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        setShareLinks(
          res.data.shareLinks.map((link) => ({
            ...link,
            shareUrl: `${appBaseUrl}/share/${link.shortCode}`,
          }))
        );
        setSharesPagination(res.data.pagination);
      }
    } catch (err: any) {
      setSharesError(err.message || 'Failed to retrieve share links');
    } finally {
      setIsSharesLoading(false);
    }
  }, [user, isAuthenticated, sharesPage, sharesSearchQuery]);

  useEffect(() => {
    void refreshVault();
  }, [refreshVault]);

  useEffect(() => {
    void refreshShares();
  }, [refreshShares]);

  const handleSetSearchQuery = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleSetStatusFilter = (status: 'PENDING' | 'AVAILABLE' | 'EXPIRED' | 'DELETED' | 'FAILED' | undefined) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleSetSharesSearchQuery = (query: string) => {
    setSharesSearchQuery(query);
    setSharesPage(1);
  };

  const deleteFile = async (fileId: string) => {
    await ApiClient.deleteFile(fileId);
    await Promise.all([refreshVault(), refreshShares()]);
  };

  const revokeShareLink = async (fileId: string, shareLinkId: string, shortCode: string) => {
    await ApiClient.revokeShareLink(fileId, shareLinkId);
    setShareLinks((prev) =>
      prev.map((link) =>
        link.id === shareLinkId || link.shortCode === shortCode
          ? { ...link, isRevoked: true }
          : link
      )
    );
    await Promise.all([refreshVault(), refreshShares()]);
  };

  const createShareLinkForFile = async (
    fileId: string,
    params: { password?: string; expiresAt?: string; maxDownloads?: number }
  ) => {
    const res = await ApiClient.createShareLink(fileId, params);
    const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${appBaseUrl}/share/${res.data.shortCode}`;

    await Promise.all([refreshVault(), refreshShares()]);

    return { shortCode: res.data.shortCode, shareUrl };
  };

  return (
    <UserVaultContext.Provider
      value={{
        files,
        shareLinks,
        metrics,
        pagination,
        sharesPagination,
        isLoading,
        isSharesLoading,
        error,
        sharesError,
        refreshVault,
        refreshShares,
        setPage,
        setStatusFilter: handleSetStatusFilter,
        setSearchQuery: handleSetSearchQuery,
        setSharesPage,
        setSharesSearchQuery: handleSetSharesSearchQuery,
        currentStatusFilter: statusFilter,
        currentSearchQuery: searchQuery,
        currentSharesSearchQuery: sharesSearchQuery,
        deleteFile,
        revokeShareLink,
        createShareLinkForFile,
      }}
    >
      {children}
    </UserVaultContext.Provider>
  );
};

export const useUserVault = (): UserVaultContextType => {
  const context = useContext(UserVaultContext);
  if (!context) {
    throw new Error('useUserVault must be used within a UserVaultProvider');
  }
  return context;
};
