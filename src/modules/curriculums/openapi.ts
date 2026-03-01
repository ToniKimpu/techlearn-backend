import { z } from "zod";
import { registry } from "../../openapi/setup.js";
import { errorResponses, PaginationMeta } from "../../openapi/helpers.js";

const CurriculumSchema = z.object({
  id: z.string().openapi({ example: "1" }),
  name: z.string().openapi({ example: "Myanmar Curriculum" }),
  description: z.string().nullable().openapi({ example: "National curriculum" }),
  image: z.string().openapi({ example: "" }),
  isDeleted: z.boolean().openapi({ example: false }),
  createdAt: z.string().openapi({ example: "2025-01-01T00:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2025-01-01T00:00:00.000Z" }),
});

const CreateBody = z.object({
  name: z.string().min(1).openapi({ example: "Myanmar Curriculum" }),
  description: z.string().optional().openapi({ example: "National curriculum" }),
  image: z.string().optional(),
});

const UpdateBody = z.object({
  name: z.string().min(1).optional().openapi({ example: "Updated name" }),
  description: z.string().optional(),
  image: z.string().optional(),
});

const ListQuery = z.object({
  page: z.number().int().positive().optional().openapi({ example: 1 }),
  limit: z.number().int().positive().max(100).optional().openapi({ example: 10 }),
  search: z.string().optional(),
});

const IdParam = z.object({
  id: z.string().openapi({ description: "Curriculum ID", example: "1" }),
});

registry.registerPath({
  method: "post",
  path: "/curriculums",
  tags: ["Curriculums"],
  summary: "Create a curriculum",
  description: "Admin only. Creates a new curriculum.",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateBody } } },
  },
  responses: {
    201: {
      description: "Curriculum created",
      content: {
        "application/json": {
          schema: z.object({ message: z.string(), data: CurriculumSchema }),
        },
      },
    },
    ...errorResponses(400, 401, 403, 409),
  },
});

registry.registerPath({
  method: "get",
  path: "/curriculums",
  tags: ["Curriculums"],
  summary: "List curriculums",
  description: "Paginated list with optional search. Cached for 5 minutes.",
  security: [{ BearerAuth: [] }],
  request: { query: ListQuery },
  responses: {
    200: {
      description: "Paginated curriculum list",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(CurriculumSchema),
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
  path: "/curriculums/{id}",
  tags: ["Curriculums"],
  summary: "Get a curriculum",
  description: "Cached for 10 minutes.",
  security: [{ BearerAuth: [] }],
  request: { params: IdParam },
  responses: {
    200: {
      description: "Curriculum details",
      content: {
        "application/json": {
          schema: z.object({ data: CurriculumSchema }),
        },
      },
    },
    ...errorResponses(401, 404),
  },
});

registry.registerPath({
  method: "put",
  path: "/curriculums/{id}",
  tags: ["Curriculums"],
  summary: "Update a curriculum",
  description: "Admin only. Invalidates cache.",
  security: [{ BearerAuth: [] }],
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: UpdateBody } } },
  },
  responses: {
    200: {
      description: "Curriculum updated",
      content: {
        "application/json": {
          schema: z.object({ message: z.string(), data: CurriculumSchema }),
        },
      },
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "delete",
  path: "/curriculums/{id}",
  tags: ["Curriculums"],
  summary: "Delete a curriculum",
  description: "Admin only. Soft delete.",
  security: [{ BearerAuth: [] }],
  request: { params: IdParam },
  responses: {
    200: {
      description: "Curriculum deleted",
      content: {
        "application/json": {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    ...errorResponses(401, 403, 404),
  },
});
