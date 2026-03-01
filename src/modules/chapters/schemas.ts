import xss from "xss";
import { z } from "zod";
import { bigIntId, paginationQuery } from "../../schemas/shared.js";

const sanitize = (val: string) => xss(val, { whiteList: {}, stripIgnoreTag: true });

export const createChapterBody = z.object({
  title: z.string().trim().min(1, "Title is required").transform(sanitize),
  sortOrder: z.number({ error: "sortOrder is required" }),
  imageUrl: z.string().trim().optional(),
  label: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? sanitize(val) : val)),
  content: z.string().trim().optional(),
  teacherGuide: z.string().trim().optional(),
  subjectId: bigIntId,
});

export const updateChapterBody = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty")
    .optional()
    .transform((val) => (val ? sanitize(val) : val)),
  sortOrder: z.number().optional(),
  imageUrl: z.string().trim().optional(),
  label: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? sanitize(val) : val)),
  content: z.string().trim().optional(),
  teacherGuide: z.string().trim().optional(),
  subjectId: bigIntId.optional(),
});

export const listChaptersQuery = paginationQuery.extend({
  subjectId: bigIntId.optional(),
});
