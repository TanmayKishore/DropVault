import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';

const REFRESH_COOKIE_NAME = 'dropvault_refresh_token';

const setRefreshTokenCookie = (res: Response, refreshToken: string): void => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    domain: config.NODE_ENV === 'production' ? config.COOKIE_DOMAIN : undefined,
  });
};

const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    domain: config.NODE_ENV === 'production' ? config.COOKIE_DOMAIN : undefined,
  });
};

export class AuthController {
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;

      const { user, tokens } = await AuthService.register(req.body, userAgent, ipAddress);

      setRefreshTokenCookie(res, tokens.refreshToken);

      res.status(201).json({
        success: true,
        data: {
          user,
          accessToken: tokens.accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;

      const { user, tokens } = await AuthService.login(req.body, userAgent, ipAddress);

      setRefreshTokenCookie(res, tokens.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          user,
          accessToken: tokens.accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!rawRefreshToken) {
        throw new AppError('Refresh token required in cookie', 401);
      }

      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;

      const { user, tokens } = await AuthService.refreshToken(rawRefreshToken, userAgent, ipAddress);

      setRefreshTokenCookie(res, tokens.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          user,
          accessToken: tokens.accessToken,
        },
      });
    } catch (err) {
      clearRefreshTokenCookie(res);
      next(err);
    }
  }

  public static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (rawRefreshToken) {
        await AuthService.logout(rawRefreshToken);
      }

      clearRefreshTokenCookie(res);

      res.status(200).json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401);
      }

      const user = await AuthService.getUserById(req.user.id);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  }
}
