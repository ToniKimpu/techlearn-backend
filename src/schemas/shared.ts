import { z } from "zod";

export const bigIntId = z
  .union([z.string(), z.number()])
  .transform((val) => String(val))
  .refine((val) => {
    try {
      return BigInt(val) >= 1n;
    } catch {
      return false;
    }
  }, "Must be a valid positive integer");

export const idParam = z.object({
  id: bigIntId,
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
});
