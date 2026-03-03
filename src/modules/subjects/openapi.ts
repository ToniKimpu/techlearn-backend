import { z } from "zod";
import { registry } from "../../openapi/setup.js";
import { errorResponses, PaginationMeta } from "../../openapi/helpers.js";

const SubjectSchema = z.object({
  id: z.string().openapi({ example: "1" }),
  name: z.string().openapi({ example: "Mathematics" }),
  description: z.string().nullable().openapi({ example: "Basic math" }),
  image: z.string().openapi({ example: "" }),
  gradeId: z.string().openapi({ example: "1" }),
  isDeleted: z.boolean().openapi({ example: false }),
  createdAt: z.string().openapi({ example: "2025-01-01T00:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2025-01-01T00:00:00.000Z" }),
});

const CreateBody = z.object({
  name: z.string().min(1).openapi({ example: "Mathematics" }),
  description: z.string().optional().openapi({ example: "Basic math" }),
  image: z.string().optional(),
  gradeId: z.union([z.string(), z.number()]).openapi({ example: "1" }),
});

const UpdateBody = z.object({
  name: z.string().min(1).optional().openapi({ example: "Updated name" }),
  description: z.string().optional(),
  image: z.string().optional(),
  gradeId: z.union([z.string(), z.number()]).optional().openapi({ example: "1" }),
});

const ListQuery = z.object({
  page: z.number().int().positive().optional().openapi({ example: 1 }),
  limit: z.number().int().positive().max(100).optional().openapi({ example: 10 }),
  search: z.string().optional(),
  gradeId: z.string().optional().openapi({ description: "Filter by grade" }),
  include: z.enum(["chapters", "breadcrumb"]).optional().openapi({
    description:
      'Use "breadcrumb" for admin panel (adds grade + curriculum names + totalChapterCount). Use "chapters" to embed full chapter list.',
  }),
});

const SubjectWithBreadcrumbSchema = SubjectSchema.extend({
  totalChapterCount: z.number().openapi({ example: 5 }),
  grade: z.object({
    name: z.string().openapi({ example: "Grade 1" }),
    curriculum: z.object({ name: z.string().openapi({ example: "English" }) }),
  }),
});

const IdParam = z.object({
  id: z.string().openapi({ description: "Subject ID", example: "1" }),
});

registry.registerPath({
  method: "post",
  path: "/subjects",
  tags: ["Subjects"],
  summary: "Create a subject",
  description: "Admin only. Creates a subject under a grade.",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateBody } } },
  },
  responses: {
    201: {
      description: "Subject created",
      content: {
        "application/json": {
          schema: z.object({ message: z.string(), data: SubjectSchema }),
        },
      },
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/subjects",
  tags: ["Subjects"],
  summary: "List subjects",
  description:
    "Paginated list with optional search and grade filter. Cached for 5 minutes. Use `include=breadcrumb` for admin panel views.",
  security: [{ BearerAuth: [] }],
  request: { query: ListQuery },
  responses: {
    200: {
      description:
        "Paginated subject list. When `include=breadcrumb`, each item includes `grade`, `grade.curriculum`, and `totalChapterCount`.",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(SubjectWithBreadcrumbSchema),
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
  path: "/subjects/{id}",
  tags: ["Subjects"],
  summary: "Get a subject",
  description: "Cached for 10 minutes.",
  security: [{ BearerAuth: [] }],
  request: { params: IdParam },
  responses: {
    200: {
      description: "Subject details",
      content: {
        "application/json": {
          schema: z.object({ data: SubjectSchema }),
        },
      },
    },
    ...errorResponses(401, 404),
  },
});

registry.registerPath({
  method: "put",
  path: "/subjects/{id}",
  tags: ["Subjects"],
  summary: "Update a subject",
  description: "Admin only. Invalidates cache.",
  security: [{ BearerAuth: [] }],
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: UpdateBody } } },
  },
  responses: {
    200: {
      description: "Subject updated",
      content: {
        "application/json": {
          schema: z.object({ message: z.string(), data: SubjectSchema }),
        },
      },
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "delete",
  path: "/subjects/{id}",
  tags: ["Subjects"],
  summary: "Delete a subject",
  description: "Admin only. Soft delete.",
  security: [{ BearerAuth: [] }],
  request: { params: IdParam },
  responses: {
    200: {
      description: "Subject deleted",
      content: {
        "application/json": {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    ...errorResponses(401, 403, 404),
  },
});
