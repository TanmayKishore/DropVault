import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.string().default('7').transform((val) => parseInt(val, 10)),
  COOKIE_DOMAIN: z.string().default('localhost'),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_PATH: z.string().default('./uploads'),
  MAX_ANONYMOUS_FILE_SIZE_BYTES: z
    .string()
    .default('1073741824')
    .transform((val) => {
      const parsed = Number(val);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error('MAX_ANONYMOUS_FILE_SIZE_BYTES must be a positive safe integer');
      }
      return parsed;
    }),
  MAX_AUTHENTICATED_FILE_SIZE_BYTES: z
    .string()
    .default('10737418240')
    .transform((val) => {
      const parsed = Number(val);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error('MAX_AUTHENTICATED_FILE_SIZE_BYTES must be a positive safe integer');
      }
      return parsed;
    }),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_BUCKET_NAME: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  CLEANUP_INTERVAL_MS: z
    .string()
    .default('300000') // 5 minutes (300,000 ms)
    .transform((val) => {
      const parsed = Number(val);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error('CLEANUP_INTERVAL_MS must be a positive safe integer');
      }
      return parsed;
    }),
  STALE_PENDING_THRESHOLD_HOURS: z
    .string()
    .default('2')
    .transform((val) => {
      const parsed = Number(val);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error('STALE_PENDING_THRESHOLD_HOURS must be a positive safe integer');
      }
      return parsed;
    }),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000') // 1 minute window
    .transform((val) => {
      const parsed = Number(val);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error('RATE_LIMIT_WINDOW_MS must be a positive safe integer');
      }
      return parsed;
    }),
  RATE_LIMIT_MAX_ATTEMPTS: z
    .string()
    .default('5') // 5 attempts per window per IP/link
    .transform((val) => {
      const parsed = Number(val);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error('RATE_LIMIT_MAX_ATTEMPTS must be a positive safe integer');
      }
      return parsed;
    }),
});

const refinedEnvSchema = envSchema.refine(
  (data) => {
    if (data.STORAGE_PROVIDER === 's3' && !data.AWS_BUCKET_NAME) {
      return false;
    }
    return true;
  },
  {
    message: 'AWS_BUCKET_NAME is required when STORAGE_PROVIDER is s3',
    path: ['AWS_BUCKET_NAME'],
  }
);

const parsedEnv = refinedEnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const config = parsedEnv.data;
