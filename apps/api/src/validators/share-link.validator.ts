import { z } from 'zod';

export const createShareLinkSchema = z.object({
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password must be at most 128 characters')
    .optional(),
  expiresAt: z
    .string()
    .datetime({ message: 'expiresAt must be a valid ISO datetime string' })
    .refine((val) => new Date(val) > new Date(), {
      message: 'expiresAt must be in the future',
    })
    .optional(),
  maxDownloads: z
    .number()
    .int('maxDownloads must be an integer')
    .positive('maxDownloads must be greater than 0')
    .optional(),
});

export const downloadShareLinkSchema = z.object({
  password: z.string().optional(),
});

export const listShareLinksQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
  search: z.string().trim().max(255).optional(),
});
