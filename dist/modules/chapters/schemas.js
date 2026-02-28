import { z } from "zod";
import { bigIntId, paginationQuery } from "../../schemas/shared.js";
export const createChapterBody = z.object({
    title: z.string().trim().min(1, "Title is required"),
    sortOrder: z.number({ error: "sortOrder is required" }),
    imageUrl: z.string().trim().optional(),
    label: z.string().trim().optional(),
    content: z.string().trim().optional(),
    teacherGuide: z.string().trim().optional(),
    subjectId: bigIntId,
});
export const updateChapterBody = z.object({
    title: z.string().trim().min(1, "Title cannot be empty").optional(),
    sortOrder: z.number().optional(),
    imageUrl: z.string().trim().optional(),
    label: z.string().trim().optional(),
    content: z.string().trim().optional(),
    teacherGuide: z.string().trim().optional(),
    subjectId: bigIntId.optional(),
});
export const listChaptersQuery = paginationQuery.extend({
    subjectId: bigIntId.optional(),
});
//# sourceMappingURL=schemas.js.map