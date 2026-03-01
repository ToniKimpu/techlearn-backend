# 11 — OpenAPI / Swagger Documentation

## Goal

Auto-generate API documentation from your Zod schemas and serve it with Swagger UI.

---

## 11.1 Install Dependencies

```bash
npm install @asteasolutions/zod-to-openapi swagger-ui-express
npm install -D @types/swagger-ui-express
```

| Package | Purpose |
|---------|---------|
| `@asteasolutions/zod-to-openapi` | Generates OpenAPI 3.0 spec from Zod schemas |
| `swagger-ui-express` | Serves interactive Swagger UI at /docs |

---

## 11.2 Why Auto-Generated Docs?

```
Manual docs:
  Write Zod schema → Write code → Write OpenAPI YAML separately
  Problem: Docs drift out of sync with code. Always.

Auto-generated docs:
  Write Zod schema → Register it → OpenAPI spec generated automatically
  Benefit: Docs are always correct. Single source of truth.
```

---

## 11.3 OpenAPI Setup

Create `src/openapi/setup.ts`:

```typescript
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with .openapi() method
// This MUST be called before any schema uses .openapi()
extendZodWithOpenApi(z);

// Shared registry — all modules register their paths here
export const registry = new OpenAPIRegistry();

// Register Bearer auth scheme
registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

// Generate the final OpenAPI document
export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "TechLearn API",
      version: "1.0.0",
      description: "Educational platform REST API",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
      { name: "Auth", description: "Authentication & authorization" },
      { name: "Curriculums", description: "Curriculum management" },
      { name: "Grades", description: "Grade management" },
      { name: "Subjects", description: "Subject management" },
      { name: "Chapters", description: "Chapter management" },
      { name: "Upload", description: "File uploads" },
      { name: "Email", description: "Email queue management" },
    ],
  });
}
```

**How it works:**
1. `extendZodWithOpenApi(z)` adds `.openapi()` method to all Zod schemas
2. Each module registers its paths on the shared `registry`
3. `generateOpenAPIDocument()` collects all registrations and builds the spec

---

## 11.4 Shared Helpers

Create `src/openapi/helpers.ts`:

```typescript
import { z } from "zod";
import { registry } from "./setup.js";

// Reusable error response schema
export const ErrorResponse = registry.register(
  "ErrorResponse",
  z.object({ message: z.string() })
);

// Reusable pagination metadata
export const PaginationMeta = registry.register(
  "PaginationMeta",
  z.object({
    page: z.number().openapi({ example: 1 }),
    limit: z.number().openapi({ example: 10 }),
    total: z.number().openapi({ example: 100 }),
    totalPages: z.number().openapi({ example: 10 }),
  })
);

// Helper: generate standard error responses
export function errorResponses(...codes: number[]) {
  const descriptions: Record<number, string> = {
    400: "Validation error",
    401: "Missing or invalid access token",
    403: "Forbidden — insufficient permissions",
    404: "Resource not found",
    409: "Conflict — duplicate resource",
    429: "Too many requests",
    500: "Internal server error",
  };

  const responses: Record<string, object> = {};
  for (const code of codes) {
    responses[code] = {
      description: descriptions[code] || `Error ${code}`,
      content: {
        "application/json": {
          schema: ErrorResponse,
        },
      },
    };
  }
  return responses;
}
```

---

## 11.5 Module OpenAPI Registration

Create `src/modules/curriculums/openapi.ts`:

```typescript
import { z } from "zod";
import { registry } from "../../openapi/setup.js";
import { errorResponses, PaginationMeta } from "../../openapi/helpers.js";

// Document-only schema (because Zod .transform() creates ZodEffects
// which zod-to-openapi can't convert to JSON Schema)
const CurriculumSchema = z.object({
  id: z.string().openapi({ example: "1" }),
  name: z.string().openapi({ example: "Nigerian Curriculum" }),
  description: z.string().nullable(),
  image: z.string(),
  isDeleted: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const CreateCurriculumBody = z.object({
  name: z.string().openapi({ example: "Nigerian Curriculum" }),
  description: z.string().optional(),
  image: z.string().optional(),
});

// POST /curriculums
registry.registerPath({
  method: "post",
  path: "/curriculums",
  tags: ["Curriculums"],
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: CreateCurriculumBody } },
    },
  },
  responses: {
    201: {
      description: "Curriculum created",
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
            data: CurriculumSchema,
          }),
        },
      },
    },
    ...errorResponses(400, 401, 403, 409),
  },
});

// GET /curriculums
registry.registerPath({
  method: "get",
  path: "/curriculums",
  tags: ["Curriculums"],
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      page: z.string().optional().openapi({ example: "1" }),
      limit: z.string().optional().openapi({ example: "10" }),
      search: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Paginated list of curriculums",
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

// GET /curriculums/{id}
registry.registerPath({
  method: "get",
  path: "/curriculums/{id}",
  tags: ["Curriculums"],
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ example: "1" }),
    }),
  },
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

// PUT /curriculums/{id} and DELETE /curriculums/{id} — similar pattern
```

**Important:** Why separate "doc-only" schemas?

Your validation schemas use `.transform(xss)` which creates `ZodEffects` — the OpenAPI generator can't convert these to JSON Schema. So you create simplified schemas just for documentation.

```
Validation: z.string().transform(xss)  ← Used in validate() middleware
OpenAPI:    z.string()                  ← Used in registry.registerPath()
```

Do the same for auth, grades, subjects, chapters, email, and upload modules.

---

## 11.6 Aggregator

Create `src/openapi/index.ts`:

```typescript
// Import setup FIRST (extends Zod)
import { generateOpenAPIDocument } from "./setup.js";
import "./helpers.js";

// Side-effect imports — each registers its paths on the shared registry
import "../modules/auth/openapi.js";
import "../modules/curriculums/openapi.js";
import "../modules/grades/openapi.js";
import "../modules/subjects/openapi.js";
import "../modules/chapters/openapi.js";
import "../modules/upload/openapi.js";
import "../modules/email/openapi.js";

// Generate the final document
export const openApiDocument = generateOpenAPIDocument();
```

---

## 11.7 Serve Swagger UI

In `src/app.ts`:

```typescript
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "./openapi/index.js";

// Swagger UI (interactive docs)
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

// Raw OpenAPI spec (JSON)
app.get("/docs/json", (_req, res) => {
  res.json(openApiDocument);
});
```

---

## 11.8 Test It

```bash
npm run dev

# Open Swagger UI
# http://localhost:4000/docs

# Raw OpenAPI spec
# http://localhost:4000/docs/json
```

In Swagger UI:
1. Click "Authorize" (top right)
2. Paste your JWT access token
3. Try any endpoint — Swagger sends the request with your token

---

## 11.9 Architecture

```
Zod Schemas (validation)          OpenAPI Schemas (documentation)
─────────────────────             ──────────────────────────────
schemas.ts                        openapi.ts
  createCurriculumBody              CreateCurriculumBody (simplified)
  .transform(xss)                   (no transforms)
  Used by validate()                Used by registry.registerPath()

              ↓                                ↓

       validate middleware              OpenAPIRegistry
       (runtime validation)            (collects all paths)

                                              ↓

                                    generateOpenAPIDocument()

                                              ↓

                                    /docs (Swagger UI)
                                    /docs/json (raw spec)
```

---

## Checkpoint

- [x] zod-to-openapi setup with shared registry
- [x] Bearer auth security scheme
- [x] Reusable ErrorResponse and PaginationMeta
- [x] 7 module openapi.ts files (27 endpoints documented)
- [x] Swagger UI at /docs
- [x] Raw spec at /docs/json
- [x] 7 tags for API organization

**Commit:** `git commit -m "add OpenAPI docs with Swagger UI, auto-generated from Zod schemas"`

---

## Key Concepts to Understand

1. **OpenAPI 3.0 specification** — Read: https://swagger.io/specification/
2. **zod-to-openapi** — Read: https://github.com/asteasolutions/zod-to-openapi
3. **Why API documentation matters** — It's the contract between frontend and backend teams
4. **Security schemes** — How API keys, OAuth, and Bearer tokens are documented in OpenAPI
5. **ZodEffects limitation** — `.transform()`, `.refine()`, `.pipe()` create effects that can't be converted to JSON Schema — use doc-only schemas instead
