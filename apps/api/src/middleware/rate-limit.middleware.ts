import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config/env.js';
import { AppError } from './error.middleware.js';

/**
 * In-memory brute force protection for share link downloads.
 * Uses a compound key: normalized IP + shortCode.
 * Note: In-memory limits reset upon process restart and are local to each Node.js process.
 */
export const shareDownloadRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS, // Configurable window (default 1 min)
  max: config.RATE_LIMIT_MAX_ATTEMPTS, // Configurable attempts (default 5)
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    keyGeneratorIpFallback: false,
  },
  keyGenerator: (req: Request): string => {
    const shortCode = req.params.shortCode || 'unknown';
    // ipKeyGenerator safely normalizes IPv4 and IPv6 subnet prefixes (accepts IP string)
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const normalizedIp = ipKeyGenerator(clientIp);
    return `${normalizedIp}:${shortCode}`;
  },
  handler: (_req: Request, _res: Response, next) => {
    next(new AppError('Too many download or password attempts. Please try again later.', 429));
  },
});
