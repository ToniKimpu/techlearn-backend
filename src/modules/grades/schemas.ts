import { z } from "zod";
import { bigIntId, paginationQuery } from "../../schemas/shared.js";

export const createGradeBody = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
  curriculumId: bigIntId,
});

export const updateGradeBody = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").optional(),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
  curriculumId: bigIntId.optional(),
});

export const listGradesQuery = paginationQuery.extend({
  curriculumId: bigIntId.optional(),
});
