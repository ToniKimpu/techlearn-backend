import { z } from "zod";
import { registry } from "../../openapi/setup.js";
import { errorResponses, PaginationMeta } from "../../openapi/helpers.js";

const GradeSchema = z.object({
  id: z.string().openapi({ example: "1" }),
  name: z.string().openapi({ example: "Grade 1" }),
  description: z.string().nullable().openapi({ example: "First grade" }),
  image: z.string().openapi({ example: "" }),
  curriculumId: z.string().openapi({ example: "1" }),
  isDeleted: z.boolean().openapi({ example: false }),
  createdAt: z.string().openapi({ example: "2025-01-01T00:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2025-01-01T00:00:00.000Z" }),
});

const CreateBody = z.object({
  name: z.string().min(1).openapi({ example: "Grade 1" }),
  description: z.string().optional().openapi({ example: "First grade" }),
  image: z.string().optional(),
  curriculumId: z.union([z.string(), z.number()]).openapi({ example: "1" }),
});

const UpdateBody = z.object({
  name: z.string().min(1).optional().openapi({ example: "Updated name" }),
  description: z.string().optional(),
  image: z.string().optional(),
  curriculumId: z.union([z.string(), z.number()]).optional().openapi({ example: "1" }),
});

const ListQuery = z.object({
  page: z.number().int().positive().optional().openapi({ example: 1 }),
  limit: z.number().int().positive().max(100).optional().openapi({ example: 10 }),
  search: z.string().optional(),
  curriculumId: z.string().optional().openapi({ description: "Filter by curriculum" }),
});

const IdParam = z.object({
  id: z.string().openapi({ description: "Grade ID", example: "1" }),
});

registry.registerPath({
  method: "post",
  path: "/grades",
  tags: ["Grades"],
  summary: "Create a grade",
  description: "Admin only. Creates a grade under a curriculum.",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateBody } } },
  },
  responses: {
    201: {
      description: "Grade created",
      content: {
        "application/json": {
          schema: z.object({ message: z.string(), data: GradeSchema }),
        },
      },
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/grades",
  tags: ["Grades"],
  summary: "List grades",
  description: "Paginated list with optional search and curriculum filter. Cached for 5 minutes.",
  security: [{ BearerAuth: [] }],
  request: { query: ListQuery },
  responses: {
    200: {
      description: "Paginated grade list",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(GradeSchema),
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
  path: "/grades/{id}",
  tags: ["Grades"],
  summary: "Get a grade",
  description: "Cached for 10 minutes.",
  security: [{ BearerAuth: [] }],
  request: { params: IdParam },
  responses: {
    200: {
      description: "Grade details",
      content: {
        "application/json": {
          schema: z.object({ data: GradeSchema }),
        },
      },
    },
    ...errorResponses(401, 404),
  },
});

registry.registerPath({
  method: "put",
  path: "/grades/{id}",
  tags: ["Grades"],
  summary: "Update a grade",
  description: "Admin only. Invalidates cache.",
  security: [{ BearerAuth: [] }],
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: UpdateBody } } },
  },
  responses: {
    200: {
      description: "Grade updated",
      content: {
        "application/json": {
          schema: z.object({ message: z.string(), data: GradeSchema }),
        },
      },
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "delete",
  path: "/grades/{id}",
  tags: ["Grades"],
  summary: "Delete a grade",
  description: "Admin only. Soft delete.",
  security: [{ BearerAuth: [] }],
  request: { params: IdParam },
  responses: {
    200: {
      description: "Grade deleted",
      content: {
        "application/json": {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    ...errorResponses(401, 403, 404),
  },
});
