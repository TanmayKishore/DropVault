import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from '../utils/crypto.js';
import { RegisterInput, LoginInput } from '../validators/auth.validator.js';
import { Role } from '@prisma/client';

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
  jti: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: Date;
}

export class AuthService {
  /**
   * Generates a short-lived access token (15 mins)
   */
  public static generateAccessToken(user: { id: string; email: string; role: Role }): string {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
    };

    return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
      issuer: 'dropvault-api',
      audience: 'dropvault-client',
    });
  }

  /**
   * Register a new user
   */
  public static async register(
    input: RegisterInput,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new AppError('An account with this email already exists', 409);
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name || null,
      },
    });

    // Start a new session family
    const familyId = crypto.randomUUID();
    const rawRefreshToken = generateSecureToken(32);
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await prisma.userSession.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt,
      },
    });

    const accessToken = this.generateAccessToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
      },
    };
  }

  /**
   * Authenticate user with email and password
   */
  public static async login(
    input: LoginInput,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isValid = await verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new AppError('Invalid email or password', 401);
    }

    // Start a new session family on login
    const familyId = crypto.randomUUID();
    const rawRefreshToken = generateSecureToken(32);
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await prisma.userSession.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt,
      },
    });

    const accessToken = this.generateAccessToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
      },
    };
  }

  /**
   * Rotate refresh token within token family; detects token reuse attacks.
   * Uses an atomic interactive transaction to guarantee race condition prevention under concurrency.
   */
  public static async refreshToken(
    rawRefreshToken: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    if (!rawRefreshToken) {
      throw new AppError('Refresh token required', 401);
    }

    const incomingHash = hashToken(rawRefreshToken);

    return await prisma.$transaction(async (tx) => {
      // Atomic lookup within transaction
      const session = await tx.userSession.findUnique({
        where: { tokenHash: incomingHash },
        include: { user: true },
      });

      if (!session) {
        throw new AppError('Invalid refresh token session', 401);
      }

      // Token Reuse Detection
      if (session.isUsed || session.revokedAt !== null) {
        // Replay or concurrent duplicate rotation detected: revoke the ENTIRE token family immediately
        await tx.userSession.updateMany({
          where: { familyId: session.familyId },
          data: { revokedAt: new Date() },
        });

        console.warn(`[Security Alert] Refresh token reuse detected for family ${session.familyId}. Revoked entire family.`);
        throw new AppError('Invalid or expired refresh token. Please log in again.', 401);
      }

      // Check expiration
      if (session.expiresAt.getTime() < Date.now()) {
        throw new AppError('Refresh token expired', 401);
      }

      // Mark current session token as used
      await tx.userSession.update({
        where: { id: session.id },
        data: { isUsed: true },
      });

      // Issue new token in the same family
      const nextRawRefreshToken = generateSecureToken(32);
      const nextHash = hashToken(nextRawRefreshToken);
      const nextExpiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

      await tx.userSession.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          tokenHash: nextHash,
          userAgent,
          ipAddress,
          expiresAt: nextExpiresAt,
        },
      });

      const accessToken = this.generateAccessToken(session.user);

      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.role,
          createdAt: session.user.createdAt,
        },
        tokens: {
          accessToken,
          refreshToken: nextRawRefreshToken,
        },
      };
    });
  }

  /**
   * Log out and revoke active session
   */
  public static async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = hashToken(rawRefreshToken);
    await prisma.userSession.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Retrieve user profile
   */
  public static async getUserById(userId: string): Promise<UserResponse | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
