import { Request, Response, NextFunction } from 'express';
import { ShareLinkService } from '../services/share-link.service.js';
import { createShareLinkSchema, listShareLinksQuerySchema } from '../validators/share-link.validator.js';
import { AccessEventType } from '@prisma/client';
import { AccessLogService } from '../services/access-log.service.js';
import { AppError } from '../middleware/error.middleware.js';

export class ShareLinkController {
  /**
   * GET /api/files/share-links
   * List all share links belonging to the authenticated user with pagination and search
   */
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new AppError('Unauthorized: Authentication required', 401));
      }

      const parsedQuery = listShareLinksQuerySchema.parse(req.query);

      const result = await ShareLinkService.listUserShareLinks({
        userId,
        page: parsedQuery.page,
        limit: parsedQuery.limit,
        search: parsedQuery.search,
      });

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/files/:id/share-links
   * Create a new share link
   */
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fileId = req.params.id;
      const userId = req.user?.id;
      const managementToken = req.headers['x-management-token'] as string | undefined;

      const validated = createShareLinkSchema.parse(req.body);

      const link = await ShareLinkService.createShareLink({
        fileId,
        userId,
        managementToken,
        password: validated.password,
        expiresAt: validated.expiresAt,
        maxDownloads: validated.maxDownloads,
        req,
      });

      res.status(201).json({
        status: 'success',
        data: link,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/files/:id/share-links/:shareLinkId
   * Revoke a specific share link
   */
  static async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: fileId, shareLinkId } = req.params;
      const userId = req.user?.id;
      const managementToken = req.headers['x-management-token'] as string | undefined;

      const result = await ShareLinkService.revokeShareLink(
        fileId,
        shareLinkId,
        userId,
        managementToken,
        req
      );

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/share/:shortCode
   * Safe public link metadata
   */
  static async getPublicInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shortCode } = req.params;
      const metadata = await ShareLinkService.getPublicLinkInfo(shortCode, req);

      res.status(200).json({
        status: 'success',
        data: metadata,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/share/:shortCode/verify-password
   * Verify share-link password without consuming a download count
   */
  static async verifyPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shortCode } = req.params;
      const password =
        (req.headers['x-share-password'] as string | undefined) ||
        req.body?.password;

      await ShareLinkService.verifySharePassword(shortCode, password, req);

      res.status(200).json({
        status: 'success',
        data: { verified: true },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/share/:shortCode/download
   * POST /api/share/:shortCode/download
   * Atomic download stream
   */
  static async download(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shortCode } = req.params;
      // Requirement: Passwords MUST NOT be accepted in URL query parameters.
      // Accept passwords exclusively through X-Share-Password header or request body.
      const password =
        (req.headers['x-share-password'] as string | undefined) ||
        req.body?.password;

      const { stream, file, shareLinkId } = await ShareLinkService.prepareDownloadStream(
        shortCode,
        password,
        req
      );

      const safeFilename = file.originalName.replace(/["\r\n\\]/g, '_');

      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', file.sizeBytes.toString());
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");

      let streamFailed = false;

      stream.on('error', (streamErr) => {
        streamFailed = true;
        console.error(`[ShareLinkController] Storage stream error for file ${file.id}:`, streamErr);
        if (!stream.destroyed) {
          stream.destroy();
        }
        if (!res.writableEnded) {
          res.destroy(streamErr);
        }
      });

      res.on('close', () => {
        if (!res.writableFinished && !stream.destroyed) {
          stream.destroy();
        }
      });

      // Record DOWNLOAD_SUCCESS only once the stream is acquired and piping begins
      void AccessLogService.logEvent({
        fileId: file.id,
        shareLinkId,
        fileIdentifierSnapshot: file.originalName,
        eventType: AccessEventType.DOWNLOAD_SUCCESS,
        req,
      });

      if (!streamFailed) {
        stream.pipe(res);
      }
    } catch (err) {
      next(err);
    }
  }
}
