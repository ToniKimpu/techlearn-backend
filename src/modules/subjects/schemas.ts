import { z } from "zod";
import { bigIntId, paginationQuery } from "../../schemas/shared.js";

export const createSubjectBody = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
  gradeId: bigIntId,
});

export const updateSubjectBody = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").optional(),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
  gradeId: bigIntId.optional(),
});

export const listSubjectsQuery = paginationQuery.extend({
  gradeId: bigIntId.optional(),
});
