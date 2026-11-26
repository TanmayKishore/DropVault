import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware.js';
import { config } from '../config/env.js';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Log unhandled server errors
  console.error('[Unhandled Error]', err);

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      ...(config.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
};
