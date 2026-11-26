import { z } from 'zod';
import { FileStatus } from '@prisma/client';

export const listFilesQuerySchema = z.object({
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
  status: z.nativeEnum(FileStatus).optional(),
  search: z.string().trim().max(255).optional(),
});

export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;
