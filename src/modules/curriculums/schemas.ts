import xss from "xss";
import { z } from "zod";
import { paginationQuery } from "../../schemas/shared.js";

const sanitize = (val: string) => xss(val, { whiteList: {}, stripIgnoreTag: true });

export const createCurriculumBody = z.object({
  name: z.string().trim().min(1, "Name is required").transform(sanitize),
  description: z.string().trim().optional().transform((val) => (val ? sanitize(val) : val)),
  image: z.string().trim().optional(),
});

export const updateCurriculumBody = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").optional().transform((val) => (val ? sanitize(val) : val)),
  description: z.string().trim().optional().transform((val) => (val ? sanitize(val) : val)),
  image: z.string().trim().optional(),
});

export const listCurriculumsQuery = paginationQuery;
