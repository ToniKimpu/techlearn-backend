import { z } from "zod";
import { registry } from "./setup.js";

export const ErrorResponse = registry.register("ErrorResponse", z.object({ message: z.string() }));

export const PaginationMeta = registry.register(
  "PaginationMeta",
  z.object({
    page: z.number().openapi({ example: 1 }),
    limit: z.number().openapi({ example: 10 }),
    total: z.number().openapi({ example: 50 }),
    totalPages: z.number().openapi({ example: 5 }),
  })
);

export function errorResponses(...codes: (400 | 401 | 403 | 404 | 409 | 429 | 500)[]) {
  const descriptions: Record<number, string> = {
    400: "Validation error",
    401: "Missing or invalid access token",
    403: "Forbidden — insufficient permissions",
    404: "Resource not found",
    409: "Conflict — duplicate resource",
    429: "Too many requests",
    500: "Internal server error",
  };

  const result: Record<string, object> = {};
  for (const code of codes) {
    result[String(code)] = {
      description: descriptions[code],
      content: { "application/json": { schema: ErrorResponse } },
    };
  }
  return result;
}
