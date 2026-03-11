import xss from "xss";
import { z } from "zod";
import { paginationQuery } from "../../schemas/shared.js";

const sanitize = (val: string) => xss(val, { whiteList: {}, stripIgnoreTag: true });

const answerBody = z.object({
  answer: z.string().trim().min(1, "Answer is required").transform(sanitize),
  isCorrect: z.boolean().default(false),
});

export const createQuestionBody = z.object({
  question: z.string().trim().min(1, "Question is required").transform(sanitize),
  image: z.string().trim().optional(),
  explanation: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? sanitize(v) : v)),
  links: z.array(z.string().url()).optional(),
  type: z.number().int().positive().optional(),
  chapterId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
  answers: z.array(answerBody).min(1, "At least one answer required").optional(),
  bloomLevelIds: z.array(z.number().int().positive()).optional(),
});

export const updateQuestionBody = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((v) => (v ? sanitize(v) : v)),
  image: z.string().trim().optional(),
  explanation: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? sanitize(v) : v)),
  links: z.array(z.string().url()).optional(),
  type: z.number().int().positive().optional(),
  chapterId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
});

export const updateAnswersBody = z.object({
  answers: z.array(answerBody).min(1, "At least one answer required"),
});

export const updateBloomLevelsBody = z.object({
  bloomLevelIds: z.array(z.number().int().positive()),
});

export const listQuestionsQuery = paginationQuery.extend({
  typeId: z.coerce.number().int().positive().optional(),
  chapterId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  // Mobile hint: pass include=answers,bloomLevels,type (comma-separated)
  include: z.string().optional(),
});
