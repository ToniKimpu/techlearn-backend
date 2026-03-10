import xss from "xss";
import { z } from "zod";
import { paginationQuery } from "../../schemas/shared.js";

const sanitize = (val: string) => xss(val, { whiteList: {}, stripIgnoreTag: true });

export const createQuestionBloomLevelBody = z.object({
  name: z.string().trim().min(1, "Name is required").transform(sanitize),
  description: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? sanitize(val) : val)),
  color: z.string().trim().min(1, "Color is required"),
  sortOrder: z.number().int().optional(),
});

export const updateQuestionBloomLevelBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty")
    .optional()
    .transform((val) => (val ? sanitize(val) : val)),
  description: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? sanitize(val) : val)),
  color: z.string().trim().min(1, "Color cannot be empty").optional(),
  sortOrder: z.number().int().optional(),
});

export const listQuestionBloomLevelQuery = paginationQuery;
