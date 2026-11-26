import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AppError } from './error.middleware.js';
import { TokenPayload } from '../services/auth.service.js';
import { Role } from '@prisma/client';

// Extend Express Request type to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
      };
    }
  }
}

export const authenticateToken = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    next(new AppError('Authentication required. Missing Bearer token.', 401));
    return;
  }

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
      next(new AppError('Access token expired', 401));
      return;
    }
    next(new AppError('Invalid access token', 401));
  }
};

export const requireRole = (role: Role) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('Authentication required', 401));
      return;
    }

    if (req.user.role !== role) {
      next(new AppError('Forbidden: Insufficient privileges', 403));
      return;
    }

    next();
  };
};
