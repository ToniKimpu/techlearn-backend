import { z } from "zod";
import { registry } from "../../openapi/setup.js";
import { errorResponses, PaginationMeta } from "../../openapi/helpers.js";

const ChapterSchema = z.object({
  id: z.string().openapi({ example: "1" }),
  title: z.string().openapi({ example: "Introduction to Numbers" }),
  sortOrder: z.number().openapi({ example: 1 }),
  imageUrl: z.string().nullable().openapi({ example: null }),
  label: z.string().nullable().openapi({ example: "Chapter 1" }),
  content: z.string().nullable().openapi({ example: "Lesson content here..." }),
  teacherGuide: z.string().nullable().openapi({ example: null }),
  subjectId: z.string().openapi({ example: "1" }),
  isDeleted: z.boolean().openapi({ example: false }),
  createdAt: z.string().openapi({ example: "2025-01-01T00:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2025-01-01T00:00:00.000Z" }),
});

const CreateBody = z.object({
  title: z.string().min(1).openapi({ example: "Introduction to Numbers" }),
  sortOrder: z.number().openapi({ example: 1 }),
  imageUrl: z.string().optional(),
  label: z.string().optional().openapi({ example: "Chapter 1" }),
  content: z.string().optional(),
  teacherGuide: z.string().optional(),
  subjectId: z.union([z.string(), z.number()]).openapi({ example: "1" }),
});

const UpdateBody = z.object({
  title: z.string().min(1).optional().openapi({ example: "Updated title" }),
  sortOrder: z.number().optional(),
  imageUrl: z.string().optional(),
  label: z.string().optional(),
  content: z.string().optional(),
  teacherGuide: z.string().optional(),
  subjectId: z.union([z.string(), z.number()]).optional().openapi({ example: "1" }),
});

const ListQuery = z.object({
  page: z.number().int().positive().optional().openapi({ example: 1 }),
  limit: z.number().int().positive().max(100).optional().openapi({ example: 10 }),
  search: z.string().optional(),
  subjectId: z.string().optional().openapi({ description: "Filter by subject" }),
});

const IdParam = z.object({
  id: z.string().openapi({ description: "Chapter ID", example: "1" }),
});

registry.registerPath({
  method: "post",
  path: "/chapters",
  tags: ["Chapters"],
  summary: "Create a chapter",
  description: "Admin only. Creates a chapter under a subject.",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateBody } } },
  },
  responses: {
    201: {
      description: "Chapter created",
      content: {
        "application/json": {
          schema: z.object({ message: z.string(), data: ChapterSchema }),
        },
      },
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/chapters",
  tags: ["Chapters"],
  summary: "List chapters",
  description: "Paginated list with optional search and subject filter. Cached for 5 minutes.",
  security: [{ BearerAuth: [] }],
  request: { query: ListQuery },
  responses: {
    200: {
      description: "Paginated chapter list",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(ChapterSchema),
            pagination: PaginationMeta,
          }),
        },
      },
    },
    ...errorResponses(401, 429),
  },
});

registry.registerPath({
  method: "get",
  path: "/chapters/{id}",
  tags: ["Chapters"],
  summary: "Get a chapter",
  description: "Cached for 10 minutes.",
  security: [{ BearerAuth: [] }],
  request: { params: IdParam },
  responses: {
    200: {
      description: "Chapter details",
      content: {
        "application/json": {
          schema: z.object({ data: ChapterSchema }),
        },
      },
    },
    ...errorResponses(401, 404),
  },
});

registry.registerPath({
  method: "put",
  path: "/chapters/{id}",
  tags: ["Chapters"],
  summary: "Update a chapter",
  description: "Admin only. Invalidates cache.",
  security: [{ BearerAuth: [] }],
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: UpdateBody } } },
  },
  responses: {
    200: {
      description: "Chapter updated",
      content: {
        "application/json": {
          schema: z.object({ message: z.string(), data: ChapterSchema }),
        },
      },
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "delete",
  path: "/chapters/{id}",
  tags: ["Chapters"],
  summary: "Delete a chapter",
  description: "Admin only. Soft delete.",
  security: [{ BearerAuth: [] }],
  request: { params: IdParam },
  responses: {
    200: {
      description: "Chapter deleted",
      content: {
        "application/json": {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    ...errorResponses(401, 403, 404),
  },
});
