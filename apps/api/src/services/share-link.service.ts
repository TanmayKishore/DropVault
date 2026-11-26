import crypto from 'crypto';
import argon2 from 'argon2';
import { prisma } from '../config/database.js';
import { AppError } from '../middleware/error.middleware.js';
import { AccessLogService } from './access-log.service.js';
import { getStorageProviderForType } from '../storage/storage.factory.js';
import { IStorageProvider } from '../storage/storage.interface.js';
import { AccessEventType, FileStatus } from '@prisma/client';
import { Request } from 'express';

export interface CreateShareLinkInput {
  fileId: string;
  userId?: string;
  managementToken?: string;
  password?: string;
  expiresAt?: string;
  maxDownloads?: number;
  req?: Request;
}

export interface PublicShareLinkMetadata {
  shortCode: string;
  originalName: string;
  sizeBytes: string;
  mimeType: string;
  expiresAt: Date | null;
  hasPassword: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  remainingDownloads: number | null;
}

export class ShareLinkService {
  /**
   * Generates a collision-resistant, unguessable short code.
   */
  private static async generateUniqueShortCode(): Promise<string> {
    for (let attempts = 0; attempts < 5; attempts++) {
      const code = crypto.randomBytes(6).toString('base64url').slice(0, 8);
      const existing = await prisma.shareLink.findUnique({ where: { shortCode: code } });
      if (!existing) return code;
    }
    return crypto.randomUUID().slice(0, 10);
  }

  /**
   * Verifies file ownership or anonymous management token authorization.
   */
  private static async verifyFileAuthorization(
    fileId: string,
    userId?: string,
    managementToken?: string
  ) {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { managementToken: true },
    });

    if (!file || file.status === FileStatus.DELETED || file.status === FileStatus.FAILED) {
      throw new AppError('File not found or unavailable', 404);
    }

    if (file.expiresAt < new Date()) {
      throw new AppError('File has expired', 410);
    }

    // Case 1: Authenticated owner
    if (file.userId) {
      if (!userId || file.userId !== userId) {
        throw new AppError('Unauthorized: Access denied to this file', 403);
      }
      return file;
    }

    // Case 2: Anonymous upload management token
    if (!managementToken) {
      throw new AppError('Unauthorized: Management token required for anonymous file', 403);
    }

    const tokenHash = crypto.createHash('sha256').update(managementToken).digest('hex');
    const tokenRecord = file.managementToken;

    if (!tokenRecord || tokenRecord.tokenHash !== tokenHash) {
      throw new AppError('Unauthorized: Invalid management token', 403);
    }

    if (tokenRecord.revokedAt) {
      throw new AppError('Unauthorized: Management token has been revoked', 403);
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new AppError('Unauthorized: Management token has expired', 403);
    }

    return file;
  }

  /**
   * Lists all share links belonging to an authenticated user's files with pagination and search.
   * Uses a single join/select query (no N+1) and excludes sensitive fields.
   */
  static async listUserShareLinks(params: {
    userId: string;
    page: number;
    limit: number;
    search?: string;
  }) {
    const { userId, page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      file: { userId },
    };

    if (search && search.trim().length > 0) {
      const term = search.trim();
      where.OR = [
        { shortCode: { contains: term, mode: 'insensitive' } },
        { file: { originalName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [links, total] = await Promise.all([
      prisma.shareLink.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          fileId: true,
          shortCode: true,
          maxDownloads: true,
          downloadCount: true,
          isRevoked: true,
          expiresAt: true,
          passwordHash: true,
          createdAt: true,
          file: {
            select: {
              originalName: true,
              sizeBytes: true,
              status: true,
              expiresAt: true,
            },
          },
        },
      }),
      prisma.shareLink.count({ where }),
    ]);

    const formattedLinks = links.map((link) => ({
      id: link.id,
      fileId: link.fileId,
      fileName: link.file.originalName,
      fileSizeBytes: link.file.sizeBytes.toString(),
      fileStatus: link.file.status,
      fileExpiresAt: link.file.expiresAt,
      shortCode: link.shortCode,
      hasPassword: Boolean(link.passwordHash),
      maxDownloads: link.maxDownloads,
      downloadCount: link.downloadCount,
      isRevoked: link.isRevoked,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
    }));

    return {
      shareLinks: formattedLinks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Creates a new public share link for a file.
   */
  static async createShareLink(input: CreateShareLinkInput) {
    const file = await this.verifyFileAuthorization(input.fileId, input.userId, input.managementToken);

    // Calculate expiry: Link expiry cannot exceed parent file expiry
    let linkExpiresAt: Date | null = null;
    if (input.expiresAt) {
      const requestedDate = new Date(input.expiresAt);
      if (requestedDate > file.expiresAt) {
        throw new AppError(`Share link expiration cannot exceed parent file expiration (${file.expiresAt.toISOString()})`, 400);
      }
      linkExpiresAt = requestedDate;
    } else {
      linkExpiresAt = file.expiresAt;
    }

    // Hash password using Argon2id if provided
    let passwordHash: string | null = null;
    if (input.password) {
      passwordHash = await argon2.hash(input.password, {
        type: argon2.argon2id,
        memoryCost: 19456, // 19 MiB
        timeCost: 2,
        parallelism: 1,
      });
    }

    const shortCode = await this.generateUniqueShortCode();

    const shareLink = await prisma.shareLink.create({
      data: {
        fileId: file.id,
        shortCode,
        passwordHash,
        maxDownloads: input.maxDownloads || null,
        expiresAt: linkExpiresAt,
      },
    });

    // Audit log
    void AccessLogService.logEvent({
      fileId: file.id,
      shareLinkId: shareLink.id,
      fileIdentifierSnapshot: file.originalName,
      eventType: AccessEventType.VIEW,
      req: input.req,
    });

    return {
      id: shareLink.id,
      fileId: shareLink.fileId,
      shortCode: shareLink.shortCode,
      maxDownloads: shareLink.maxDownloads,
      downloadCount: shareLink.downloadCount,
      hasPassword: !!shareLink.passwordHash,
      expiresAt: shareLink.expiresAt,
      createdAt: shareLink.createdAt,
    };
  }

  /**
   * Retrieves safe public metadata for a share link.
   */
  static async getPublicLinkInfo(shortCode: string, req?: Request): Promise<PublicShareLinkMetadata> {
    const shareLink = await prisma.shareLink.findUnique({
      where: { shortCode },
      include: { file: true },
    });

    if (!shareLink) {
      throw new AppError('Share link not found', 404);
    }

    const file = shareLink.file;

    // Check link revocation
    if (shareLink.isRevoked) {
      void AccessLogService.logEvent({
        fileId: file.id,
        shareLinkId: shareLink.id,
        fileIdentifierSnapshot: file.originalName,
        eventType: AccessEventType.REVOKED_ATTEMPT,
        req,
      });
      throw new AppError('This share link has been revoked', 403);
    }

    // Check link expiration
    const now = new Date();
    if (shareLink.expiresAt && shareLink.expiresAt < now) {
      throw new AppError('This share link has expired', 410);
    }

    // Check parent file availability and expiration
    if (file.status !== FileStatus.AVAILABLE || file.expiresAt < now) {
      throw new AppError('The requested file is no longer available', 410);
    }

    // Check if download limit reached
    if (shareLink.maxDownloads !== null && shareLink.downloadCount >= shareLink.maxDownloads) {
      void AccessLogService.logEvent({
        fileId: file.id,
        shareLinkId: shareLink.id,
        fileIdentifierSnapshot: file.originalName,
        eventType: AccessEventType.LIMIT_REACHED,
        req,
      });
      throw new AppError('Download limit for this share link has been reached', 410);
    }

    // Record VIEW log
    void AccessLogService.logEvent({
      fileId: file.id,
      shareLinkId: shareLink.id,
      fileIdentifierSnapshot: file.originalName,
      eventType: AccessEventType.VIEW,
      req,
    });

    const remaining = shareLink.maxDownloads !== null
      ? Math.max(0, shareLink.maxDownloads - shareLink.downloadCount)
      : null;

    return {
      shortCode: shareLink.shortCode,
      originalName: file.originalName,
      sizeBytes: file.sizeBytes.toString(),
      mimeType: file.mimeType,
      expiresAt: shareLink.expiresAt,
      hasPassword: !!shareLink.passwordHash,
      maxDownloads: shareLink.maxDownloads,
      downloadCount: shareLink.downloadCount,
      remainingDownloads: remaining,
    };
  }

  /**
   * Verifies a share link's password and availability without consuming a download count.
   * Used by the frontend prior to submitting a native browser form POST download.
   */
  static async verifySharePassword(shortCode: string, password?: string, req?: Request): Promise<void> {
    const shareLink = await prisma.shareLink.findUnique({
      where: { shortCode },
      include: { file: true },
    });

    if (!shareLink) {
      throw new AppError('Share link not found', 404);
    }

    const file = shareLink.file;
    const now = new Date();

    if (shareLink.isRevoked) {
      throw new AppError('This share link has been revoked', 403);
    }
    if (shareLink.expiresAt && shareLink.expiresAt < now) {
      throw new AppError('This share link has expired', 410);
    }
    if (file.status !== FileStatus.AVAILABLE || file.expiresAt < now) {
      throw new AppError('The requested file is no longer available', 410);
    }
    if (shareLink.maxDownloads !== null && shareLink.downloadCount >= shareLink.maxDownloads) {
      throw new AppError('Download limit for this share link has been reached', 410);
    }

    if (shareLink.passwordHash) {
      if (!password) {
        void AccessLogService.logEvent({
          fileId: file.id,
          shareLinkId: shareLink.id,
          fileIdentifierSnapshot: file.originalName,
          eventType: AccessEventType.PASSWORD_FAILED,
          req,
        });
        throw new AppError('Password required to download this file', 401);
      }

      const isValidPassword = await argon2.verify(shareLink.passwordHash, password);
      if (!isValidPassword) {
        void AccessLogService.logEvent({
          fileId: file.id,
          shareLinkId: shareLink.id,
          fileIdentifierSnapshot: file.originalName,
          eventType: AccessEventType.PASSWORD_FAILED,
          req,
        });
        throw new AppError('Incorrect password', 401);
      }
    }
  }

  /**
   * Atomic download limit decrement & authorization check.
   * Guarantees that concurrent requests cannot exceed maxDownloads.
   */
  static async prepareDownloadStream(
    shortCode: string,
    password?: string,
    req?: Request,
    range?: { start: number; end: number },
    customStorageProvider?: IStorageProvider
  ) {
    // 1. Fetch link and parent file info
    const shareLink = await prisma.shareLink.findUnique({
      where: { shortCode },
      include: { file: true },
    });

    if (!shareLink) {
      throw new AppError('Share link not found', 404);
    }

    const file = shareLink.file;

    // Check revocation
    if (shareLink.isRevoked) {
      void AccessLogService.logEvent({
        fileId: file.id,
        shareLinkId: shareLink.id,
        fileIdentifierSnapshot: file.originalName,
        eventType: AccessEventType.REVOKED_ATTEMPT,
        req,
      });
      throw new AppError('This share link has been revoked', 403);
    }

    // Check link expiration
    const now = new Date();
    if (shareLink.expiresAt && shareLink.expiresAt < now) {
      throw new AppError('This share link has expired', 410);
    }

    // Check file availability and expiration
    if (file.status !== FileStatus.AVAILABLE || file.expiresAt < now) {
      throw new AppError('The requested file is no longer available', 410);
    }

    // 2. Validate password if protected
    if (shareLink.passwordHash) {
      if (!password) {
        void AccessLogService.logEvent({
          fileId: file.id,
          shareLinkId: shareLink.id,
          fileIdentifierSnapshot: file.originalName,
          eventType: AccessEventType.PASSWORD_FAILED,
          req,
        });
        throw new AppError('Password required to download this file', 401);
      }

      const isValidPassword = await argon2.verify(shareLink.passwordHash, password);
      if (!isValidPassword) {
        void AccessLogService.logEvent({
          fileId: file.id,
          shareLinkId: shareLink.id,
          fileIdentifierSnapshot: file.originalName,
          eventType: AccessEventType.PASSWORD_FAILED,
          req,
        });
        throw new AppError('Incorrect password', 401);
      }
    }

    // 3. Atomic Database-Level Download Limit Consumption & Parent File Verification
    // Uses raw SQL UPDATE ... FROM files to atomically guarantee:
    // a) Parent file status is AVAILABLE
    // b) Parent file is not expired (files.expires_at > now)
    // c) Share link is not revoked
    // d) Share link is not expired (share_links.expires_at > now)
    // e) Download count is strictly below max_downloads (or max_downloads IS NULL)
    // This executes in a single atomic SQL command preventing race conditions with
    // file expiration, background worker cleanup, or concurrent downloads.
    const updatedRows = await prisma.$queryRaw<Array<{ id: string; download_count: number; max_downloads: number | null }>>`
      UPDATE "share_links" sl
      SET "download_count" = sl."download_count" + 1
      FROM "files" f
      WHERE sl."id" = ${shareLink.id}
        AND sl."file_id" = f."id"
        AND sl."is_revoked" = false
        AND (sl."expires_at" IS NULL OR sl."expires_at" > ${now})
        AND (sl."max_downloads" IS NULL OR sl."download_count" < sl."max_downloads")
        AND f."status" = 'AVAILABLE'::"FileStatus"
        AND f."expires_at" > ${now}
      RETURNING sl."id", sl."download_count", sl."max_downloads";
    `;

    if (!updatedRows || updatedRows.length === 0) {
      void AccessLogService.logEvent({
        fileId: file.id,
        shareLinkId: shareLink.id,
        fileIdentifierSnapshot: file.originalName,
        eventType: AccessEventType.LIMIT_REACHED,
        req,
      });
      throw new AppError('Download limit reached or link is no longer active', 410);
    }

    // 4. Retrieve storage stream before recording DOWNLOAD_SUCCESS
    const storage = customStorageProvider ?? getStorageProviderForType(file.storageProvider);
    let stream;
    try {
      stream = await storage.getStream(file.storageKey, range);
    } catch (storageErr) {
      void AccessLogService.logEvent({
        fileId: file.id,
        shareLinkId: shareLink.id,
        fileIdentifierSnapshot: file.originalName,
        eventType: AccessEventType.DOWNLOAD_ATTEMPT,
        req,
      });
      throw storageErr;
    }

    return {
      stream,
      file,
      shareLinkId: shareLink.id,
    };
  }

  /**
   * Revokes a specific share link.
   */
  static async revokeShareLink(
    fileId: string,
    shareLinkId: string,
    userId?: string,
    managementToken?: string,
    req?: Request
  ) {
    const file = await this.verifyFileAuthorization(fileId, userId, managementToken);

    const shareLink = await prisma.shareLink.findUnique({
      where: { id: shareLinkId },
    });

    if (!shareLink || shareLink.fileId !== file.id) {
      throw new AppError('Share link not found for this file', 404);
    }

    if (shareLink.isRevoked) {
      return { message: 'Share link is already revoked', isRevoked: true };
    }

    await prisma.shareLink.update({
      where: { id: shareLink.id },
      data: { isRevoked: true },
    });

    void AccessLogService.logEvent({
      fileId: file.id,
      shareLinkId: shareLink.id,
      fileIdentifierSnapshot: file.originalName,
      eventType: AccessEventType.REVOKED_ATTEMPT,
      req,
    });

    return { message: 'Share link revoked successfully', isRevoked: true };
  }
}
