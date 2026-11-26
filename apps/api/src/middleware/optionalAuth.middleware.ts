import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AppError } from './error.middleware.js';
import { TokenPayload } from '../services/auth.service.js';

/**
 * Optional authentication middleware:
 * - No Authorization header: allowed as anonymous access (req.user = undefined).
 * - Valid Bearer token: populates authenticated user context (req.user).
 * - Invalid/Expired Bearer token: rejects with 401 (never downgrades to anonymous).
 */
export const optionalAuthenticateToken = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  // 1. No Authorization header -> Anonymous access
  if (!authHeader) {
    req.user = undefined;
    return next();
  }

  // 2. Authorization header present but not Bearer format -> Reject
  if (!authHeader.startsWith('Bearer ')) {
    return next(new AppError('Invalid Authorization header format. Expected Bearer token.', 401));
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next(new AppError('Bearer token cannot be empty', 401));
  }

  // 3. Verify Bearer token
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'dropvault-api',
      audience: 'dropvault-client',
    }) as TokenPayload;

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError('Access token expired', 401));
    }
    return next(new AppError('Invalid access token', 401));
  }
};
