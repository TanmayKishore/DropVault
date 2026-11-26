import { auth } from './auth';

export interface FileMetadata {
  id: string;
  originalName: string;
  sizeBytes: string;
  mimeType: string;
  status: 'PENDING' | 'AVAILABLE' | 'EXPIRED' | 'DELETED' | 'FAILED';
  expiresAt: string;
  createdAt: string;
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

export interface ListFilesParams {
  page?: number;
  limit?: number;
  status?: 'PENDING' | 'AVAILABLE' | 'EXPIRED' | 'DELETED' | 'FAILED';
  search?: string;
}

export interface ListFilesResponse {
  status: 'success';
  data: {
    files: FileMetadata[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    metrics: {
      totalFiles: number;
      availableFiles: number;
      expiredFiles: number;
      activeShareLinks: number;
    };
  };
}

export interface ListShareLinksParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface AccountShareLinkItem {
  id: string;
  fileId: string;
  fileName: string;
  fileSizeBytes: string;
  fileStatus: 'PENDING' | 'AVAILABLE' | 'EXPIRED' | 'DELETED' | 'FAILED';
  fileExpiresAt: string;
  shortCode: string;
  hasPassword: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  isRevoked: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface ListShareLinksResponse {
  status: 'success';
  data: {
    shareLinks: AccountShareLinkItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface PublicShareLinkMetadata {
  shortCode: string;
  originalName: string;
  sizeBytes: string;
  mimeType: string;
  expiresAt: string | null;
  hasPassword: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  remainingDownloads: number | null;
}

export class ApiRequestError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ApiRequestError.prototype);
  }
}

export interface FileUploadSuccessResponse {
  status: 'success';
  data: {
    file: {
      id: string;
      originalName: string;
      sizeBytes: string;
      mimeType: string;
      expiresAt: string;
      createdAt: string;
    };
    managementToken?: string;
    shareLink: {
      shortCode: string;
    };
  };
}

export interface ShareLinkCreatedResponse {
  status: 'success';
  data: {
    id: string;
    fileId: string;
    shortCode: string;
    hasPassword: boolean;
    expiresAt: string | null;
    maxDownloads: number | null;
    downloadCount: number;
    createdAt: string;
  };
}

export interface UploadOptions {
  expiryDays?: number;
  password?: string;
  maxDownloads?: number;
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export const MAX_ANONYMOUS_SIZE_BYTES = 1073741824; // Exactly 1 GiB (1,073,741,824 bytes)
export const MAX_AUTHENTICATED_SIZE_BYTES = 10737418240; // 10 GiB

export class ApiClient {
  private static getApiUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  }

  /**
   * Upload file via XMLHttpRequest for accurate streaming progress & abort support.
   */
  static uploadFile(
    file: File,
    options: UploadOptions = {}
  ): Promise<FileUploadSuccessResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const apiUrl = `${this.getApiUrl()}/api/files/upload`;

      const formData = new FormData();
      formData.append('file', file);
      if (options.expiryDays) {
        formData.append('expiryDays', options.expiryDays.toString());
      }

      // Progress reporting
      if (xhr.upload && options.onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
            options.onProgress?.(percent, event.loaded, event.total);
          }
        };
      }

      // Abort signal integration
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new DOMException('Upload aborted by user', 'AbortError'));
        });
      }

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(response as FileUploadSuccessResponse);
          } else {
            const errorMessage =
              response.message ||
              response.error?.message ||
              `Upload failed with HTTP ${xhr.status}`;
            reject(new Error(errorMessage));
          }
        } catch {
          reject(new Error(`Failed to parse server response (HTTP ${xhr.status})`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during upload. Please check your connection.'));
      };

      xhr.onabort = () => {
        reject(new DOMException('Upload cancelled', 'AbortError'));
      };

      xhr.open('POST', apiUrl, true);

      // Add Authorization header if user is logged in
      const token = auth.getAccessToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  }

  /**
   * GET /api/files
   * Account-wide file listing with pagination, filters, and metrics
   */
  static async listFiles(params: ListFilesParams = {}): Promise<ListFilesResponse> {
    const headers: Record<string, string> = {};
    const token = auth.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);

    const queryString = query.toString();
    const url = `${this.getApiUrl()}/api/files${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || json.error?.message || 'Failed to list files');
    }
    return json;
  }

  /**
   * GET /api/files/share-links
   * Account-wide share links listing with pagination and search
   */
  static async listShareLinks(params: ListShareLinksParams = {}): Promise<ListShareLinksResponse> {
    const headers: Record<string, string> = {};
    const token = auth.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.search) query.set('search', params.search);

    const queryString = query.toString();
    const url = `${this.getApiUrl()}/api/files/share-links${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || json.error?.message || 'Failed to list share links');
    }
    return json;
  }

  /**
   * GET /api/files/:id
   * Retrieve file metadata with shareLinks
   */
  static async getFileMetadata(
    fileId: string,
    managementToken?: string
  ): Promise<{ status: string; data: FileMetadata }> {
    const headers: Record<string, string> = {};
    const token = auth.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (managementToken) {
      headers['X-Management-Token'] = managementToken;
    }

    const res = await fetch(`${this.getApiUrl()}/api/files/${fileId}`, {
      method: 'GET',
      headers,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || json.error?.message || 'Failed to retrieve file metadata');
    }
    return json;
  }

  /**
   * GET /api/files/:id/download
   * Stream download for owner / management token holder
   */
  static async downloadOwnerFile(
    fileId: string,
    filename: string,
    managementToken?: string
  ): Promise<void> {
    const headers: Record<string, string> = {};
    const token = auth.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (managementToken) {
      headers['X-Management-Token'] = managementToken;
    }

    const res = await fetch(`${this.getApiUrl()}/api/files/${fileId}/download`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson.message || `Download failed with HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename || 'downloaded-file';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    a.remove();
  }

  /**
   * DELETE /api/files/:id
   * Physically delete file from storage and database
   */
  static async deleteFile(
    fileId: string,
    managementToken?: string
  ): Promise<{ status: string; message: string }> {
    const headers: Record<string, string> = {};
    const token = auth.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (managementToken) {
      headers['X-Management-Token'] = managementToken;
    }

    const res = await fetch(`${this.getApiUrl()}/api/files/${fileId}`, {
      method: 'DELETE',
      headers,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || json.error?.message || 'Failed to delete file');
    }
    return json;
  }

  /**
   * POST /api/files/:id/share-links
   * Create configured share link
   */
  static async createShareLink(
    fileId: string,
    params: {
      password?: string;
      expiresAt?: string;
      maxDownloads?: number;
      managementToken?: string;
    }
  ): Promise<ShareLinkCreatedResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = auth.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (params.managementToken) {
      headers['X-Management-Token'] = params.managementToken;
    }

    const res = await fetch(`${this.getApiUrl()}/api/files/${fileId}/share-links`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        password: params.password || undefined,
        expiresAt: params.expiresAt || undefined,
        maxDownloads: params.maxDownloads || undefined,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || json.error?.message || 'Failed to create configured share link');
    }

    return json;
  }

  /**
   * DELETE /api/files/:id/share-links/:shareLinkId
   * Revoke a specific share link
   */
  static async revokeShareLink(
    fileId: string,
    shareLinkId: string,
    managementToken?: string
  ): Promise<{ status: string; data: { id: string; isRevoked: boolean } }> {
    const headers: Record<string, string> = {};
    const token = auth.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (managementToken) {
      headers['X-Management-Token'] = managementToken;
    }

    const res = await fetch(`${this.getApiUrl()}/api/files/${fileId}/share-links/${shareLinkId}`, {
      method: 'DELETE',
      headers,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || json.error?.message || 'Failed to revoke share link');
    }
    return json;
  }

  private static extractErrorMessage(json: any, fallback: string): string {
    return json?.error?.message || json?.message || fallback;
  }

  private static parseFilenameFromDisposition(
    disposition: string | null,
    fallbackName: string
  ): string {
    if (!disposition) return fallbackName;
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";\r\n]+)"?/i);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1].trim());
      } catch {
        return match[1].trim();
      }
    }
    return fallbackName;
  }

  /**
   * GET /api/share/:shortCode
   * Retrieve safe public metadata for a share link
   */
  static async getPublicShareInfo(shortCode: string): Promise<PublicShareLinkMetadata> {
    const res = await fetch(`${this.getApiUrl()}/api/share/${encodeURIComponent(shortCode)}`, {
      method: 'GET',
      cache: 'no-store',
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiRequestError(
        this.extractErrorMessage(json, 'Unable to load share link information.'),
        res.status
      );
    }

    return json.data;
  }

  /**
   * POST /api/share/:shortCode/verify-password
   * Pre-verify share-link password without consuming a download count
   */
  static async verifySharePassword(shortCode: string, password: string): Promise<void> {
    const res = await fetch(
      `${this.getApiUrl()}/api/share/${encodeURIComponent(shortCode)}/verify-password`,
      {
        method: 'POST',
        headers: {
          'X-Share-Password': password,
        },
      }
    );

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new ApiRequestError(
        this.extractErrorMessage(errorJson, `Verification failed (HTTP ${res.status}).`),
        res.status
      );
    }
  }

  /**
   * Triggers a native browser-managed download with zero JavaScript memory buffering.
   * - Unprotected links: native <a> navigation to GET /api/share/:shortCode/download
   * - Password-protected links: native HTML <form method="POST"> with application/x-www-form-urlencoded body
   */
  static triggerBrowserDownload(
    shortCode: string,
    options: {
      password?: string;
      fallbackFilename?: string;
    } = {}
  ): void {
    const downloadUrl = `${this.getApiUrl()}/api/share/${encodeURIComponent(shortCode)}/download`;

    if (options.password) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = downloadUrl;
      form.enctype = 'application/x-www-form-urlencoded';
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'password';
      input.value = options.password;

      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
      form.remove();
      return;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    if (options.fallbackFilename) {
      a.download = options.fallbackFilename;
    }
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
