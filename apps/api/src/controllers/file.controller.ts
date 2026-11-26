import { Request, Response, NextFunction } from 'express';
import busboy from 'busboy';
import { FileService } from '../services/file.service.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { listFilesQuerySchema } from '../validators/file.validator.js';

export class FileController {
  /**
   * POST /api/files/upload
   * Streaming multipart upload endpoint
   */
  static async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return next(new AppError('Content-Type must be multipart/form-data', 400));
    }

    const userId = req.user?.id;
    const maxLimit = userId
      ? config.MAX_AUTHENTICATED_FILE_SIZE_BYTES
      : config.MAX_ANONYMOUS_FILE_SIZE_BYTES;

    let bb: busboy.Busboy;
    try {
      bb = busboy({
        headers: req.headers,
        limits: {
          files: 1, // Only 1 file per upload request
          fields: 5,
          fileSize: maxLimit,
          fieldSize: 10 * 1024,
          headerPairs: 100,
        },
      });
    } catch (err) {
      return next(new AppError('Failed to parse multipart request headers', 400));
    }

    let fileHandled = false;
    let uploadPromise: Promise<any> | null = null;
    let expiryDays = 7;

    bb.on('field', (name, val) => {
      if (name === 'expiryDays') {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed)) {
          expiryDays = parsed;
        }
      }
    });

    bb.on('file', (_name, fileStream, info) => {
      if (fileHandled) {
        fileStream.resume(); // Discard any subsequent file
        return;
      }
      fileHandled = true;

      const { filename, mimeType } = info;

      uploadPromise = FileService.uploadFile({
        stream: fileStream,
        originalName: filename || 'unnamed-file',
        clientMimeType: mimeType,
        userId,
        expiryDays,
      });
    });

    bb.on('error', (err: any) => {
      next(err);
    });

    bb.on('finish', async () => {
      if (!fileHandled || !uploadPromise) {
        return next(new AppError('No file uploaded', 400));
      }

      try {
        const result = await uploadPromise;
        res.status(201).json({
          status: 'success',
          data: result,
        });
      } catch (err) {
        next(err);
      }
    });

    req.pipe(bb);
  }

  /**
   * GET /api/files
   * List files for authenticated user with pagination, filter, search, and metrics
   */
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new AppError('Unauthorized: Authentication required', 401));
      }

      const parsedQuery = listFilesQuerySchema.parse(req.query);

      const result = await FileService.listFiles({
        userId,
        page: parsedQuery.page,
        limit: parsedQuery.limit,
        status: parsedQuery.status,
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
   * GET /api/files/:id
   * Retrieve file metadata
   */
  static async getMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fileId = req.params.id;
      const managementToken = req.headers['x-management-token'] as string | undefined;
      const userId = req.user?.id;

      const metadata = await FileService.getFileMetadata(fileId, userId, managementToken);

      res.status(200).json({
        status: 'success',
        data: metadata,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/files/:id/download
   * Owner/Management streaming download
   */
  static async download(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fileId = req.params.id;
      const managementToken = req.headers['x-management-token'] as string | undefined;
      const userId = req.user?.id;

      const { stream, file } = await FileService.getDownloadStream(
        fileId,
        userId,
        managementToken
      );

      // Sanitize filename for Content-Disposition header
      const safeFilename = file.originalName.replace(/["\r\n\\]/g, '_');

      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', file.sizeBytes.toString());
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/files/:id
   * File deletion
   */
  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fileId = req.params.id;
      const managementToken = req.headers['x-management-token'] as string | undefined;
      const userId = req.user?.id;

      await FileService.deleteFile(fileId, userId, managementToken);

      res.status(200).json({
        status: 'success',
        message: 'File deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/files/:id/revoke-management
   * Revoke an anonymous management token
   */
  static async revokeManagement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fileId = req.params.id;
      // Accepts token from header X-Management-Token or body { managementToken }
      const managementToken =
        (req.headers['x-management-token'] as string | undefined) ||
        req.body?.managementToken;

      await FileService.revokeManagementToken(fileId, managementToken);

      res.status(200).json({
        status: 'success',
        message: 'Management token revoked successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}
