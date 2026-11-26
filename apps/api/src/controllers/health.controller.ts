import { Request, Response, NextFunction } from 'express';
import { HealthService } from '../services/health.service.js';

export const getHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const health = await HealthService.getHealth();
    res.status(200).json({
      success: true,
      data: {
        ...health,
        environment: process.env.DROPVAULT_E2E === 'true' ? 'e2e' : process.env.NODE_ENV || 'development',
      },
    });
  } catch (err) {
    next(err);
  }
};
