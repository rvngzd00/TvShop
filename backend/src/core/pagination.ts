import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.string().trim().max(40).optional()
});

export function paginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit))
  };
}
