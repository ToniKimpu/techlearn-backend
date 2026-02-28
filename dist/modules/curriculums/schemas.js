import { z } from "zod";
import { paginationQuery } from "../../schemas/shared.js";
export const createCurriculumBody = z.object({
    name: z.string().trim().min(1, "Name is required"),
    description: z.string().trim().optional(),
    image: z.string().trim().optional(),
});
export const updateCurriculumBody = z.object({
    name: z.string().trim().min(1, "Name cannot be empty").optional(),
    description: z.string().trim().optional(),
    image: z.string().trim().optional(),
});
export const listCurriculumsQuery = paginationQuery;
//# sourceMappingURL=schemas.js.map