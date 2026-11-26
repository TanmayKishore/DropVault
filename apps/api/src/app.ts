import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import apiRoutes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AppError } from './middleware/error.middleware.js';

export const createApp = (): Express => {
  const app = express();

  // Configure trusted proxy behavior for EC2 / reverse proxy deployment (e.g. Nginx, ALB)
  // 'loopback, linklocal, uniquelocal' prevents trusting spoofed X-Forwarded-For headers from untrusted clients
  app.set('trust proxy', config.NODE_ENV === 'production' ? 1 : true);

  // Security Headers
  app.use(helmet());

  // CORS configuration
  const allowedOrigins = config.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(new AppError('Not allowed by CORS', 403));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Share-Password', 'X-Management-Token'],
      exposedHeaders: ['Content-Disposition', 'Content-Length'],
    })
  );

  // Cookie Parsing
  app.use(cookieParser());

  // Body Parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api', apiRoutes);

  // 404 handler for undefined routes
  app.use((req, _res, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
};
