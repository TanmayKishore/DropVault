import { Request } from 'express';
import { prisma } from '../config/database.js';
import { AccessEventType } from '@prisma/client';

export interface LogAccessParams {
  fileId?: string;
  shareLinkId?: string;
  fileIdentifierSnapshot: string;
  eventType: AccessEventType;
  req?: Request;
  ipAddress?: string;
  userAgent?: string;
}

export class AccessLogService {
  /**
   * Records an access event asynchronously.
   * Ensures logging failures never crash or interrupt the core request/download flow.
   * Strips/omits any sensitive secrets (passwords, tokens).
   */
  static async logEvent(params: LogAccessParams): Promise<void> {
    try {
      let ip = params.ipAddress;
      let ua = params.userAgent;

      if (params.req) {
        // Safe IP extraction
        const forwarded = params.req.headers['x-forwarded-for'];
        ip = typeof forwarded === 'string'
          ? forwarded.split(',')[0].trim()
          : (params.req.socket?.remoteAddress || 'unknown');
        
        ua = params.req.headers['user-agent']?.slice(0, 500);
      }

      await prisma.accessLog.create({
        data: {
          fileId: params.fileId || null,
          shareLinkId: params.shareLinkId || null,
          fileIdentifierSnapshot: params.fileIdentifierSnapshot.slice(0, 255),
          eventType: params.eventType,
          ipAddress: ip ? ip.slice(0, 100) : null,
          userAgent: ua ? ua.slice(0, 500) : null,
        },
      });
    } catch (err: any) {
      console.warn('[AccessLogService] Failed to record access log:', err.message);
    }
  }
}
