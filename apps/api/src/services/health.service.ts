import { checkDatabaseConnection } from '../config/database.js';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  database: {
    status: 'connected' | 'disconnected';
    details?: string;
  };
}

export class HealthService {
  public static async getHealth(): Promise<HealthStatus> {
    const dbCheck = await checkDatabaseConnection();

    return {
      status: dbCheck.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      database: {
        status: dbCheck.connected ? 'connected' : 'disconnected',
        ...(dbCheck.error ? { details: dbCheck.error } : {}),
      },
    };
  }
}
