# 05 — CRUD Modules (Curriculums, Grades, Subjects, Chapters)

## Goal

Build four CRUD modules following a consistent service-layer pattern. Each has: create, list (paginated), get by ID, update, and soft delete.

---

## 5.1 The Pattern

Every CRUD module follows the same structure:

```
src/modules/<module>/
  routes.ts    ← Thin HTTP handlers: parse request → call service → send response
  service.ts   ← ALL business logic: validation, DB queries, caching
  schemas.ts   ← Zod validation (added in guide 06)
  openapi.ts   ← API documentation (added in guide 11)
```

**Why this separation?**
- **Routes** only handle HTTP concerns (status codes, headers, req/res parsing)
- **Services** contain reusable business logic (can be called from routes, tests, queue workers)
- **Schemas** define data shape and validation rules
- This makes testing easier — you can test services without HTTP, and test routes with mocked services

---

## 5.2 Shared Schemas

Create `src/schemas/shared.ts`:

```typescript
import { z } from "zod";

// Validates and converts a BigInt ID from string/number input
export const bigIntId = z
  .union([z.string(), z.number()])
  .transform((val) => {
    try {
      return BigInt(val);
    } catch {
      throw new Error("Invalid ID");
    }
  });

// Common param: { id: BigInt }
export const idParam = z.object({
  id: bigIntId,
});

// Pagination query params
export const paginationQuery = z.object({
  page: z
    .string()
    .optional()
    .default("1")
    .transform(Number)
    .pipe(z.number().int().positive()),
  limit: z
    .string()
    .optional()
    .default("10")
    .transform(Number)
    .pipe(z.number().int().positive().max(100)),
  search: z.string().optional(),
});
```

**BigInt IDs:** The CRUD models use BigInt IDs (autoincrement). When IDs come from URL params or query strings, they arrive as strings. This schema converts them to BigInt for Prisma.

**Pagination:** `page` and `limit` come as strings from query params. We transform them to numbers, validate they're positive integers, and cap `limit` at 100.

---

## 5.3 Build the Curriculums Module (Full Example)

This is the simplest CRUD module. Build this one fully, then the others follow the same pattern.

### Service (`src/modules/curriculums/service.ts`):

```typescript
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../utils/errors.js";

// CREATE
export async function create(data: { name: string; description?: string; image?: string }) {
  try {
    const curriculum = await prisma.curriculum.create({ data });
    return curriculum;
  } catch (error: any) {
    // Prisma unique constraint violation
    if (error.code === "P2002") {
      throw new AppError(409, "Curriculum with this name already exists");
    }
    throw error;
  }
}

// LIST (paginated + searchable)
export async function list(params: { page: number; limit: number; search?: string }) {
  const { page, limit, search } = params;
  const skip = (page - 1) * limit;

  const where = {
    isDeleted: false,
    ...(search && {
      name: { contains: search, mode: "insensitive" as const },
    }),
  };

  const [data, total] = await Promise.all([
    prisma.curriculum.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.curriculum.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// GET BY ID
export async function getById(id: bigint) {
  const curriculum = await prisma.curriculum.findFirst({
    where: { id, isDeleted: false },
  });

  if (!curriculum) {
    throw new AppError(404, "Curriculum not found");
  }

  return curriculum;
}

// UPDATE
export async function update(id: bigint, data: { name?: string; description?: string; image?: string }) {
  // Check exists
  const existing = await prisma.curriculum.findFirst({
    where: { id, isDeleted: false },
  });

  if (!existing) {
    throw new AppError(404, "Curriculum not found");
  }

  return prisma.curriculum.update({ where: { id }, data });
}

// SOFT DELETE
export async function softDelete(id: bigint) {
  const existing = await prisma.curriculum.findFirst({
    where: { id, isDeleted: false },
  });

  if (!existing) {
    throw new AppError(404, "Curriculum not found");
  }

  return prisma.curriculum.update({
    where: { id },
    data: { isDeleted: true },
  });
}
```

**Key patterns:**

1. **Soft delete** — Sets `isDeleted: true` instead of deleting the row. This means:
   - All queries filter by `isDeleted: false`
   - Data can be recovered
   - Foreign key references don't break

2. **Prisma error codes** — `P2002` means unique constraint violation. Handle it to return a friendly 409 instead of a 500.

3. **Parallel queries** — `Promise.all([findMany, count])` runs both queries simultaneously. Faster than running them sequentially.

4. **Pagination math** — `skip = (page - 1) * limit`. Page 1 skips 0, page 2 skips `limit`, etc.

### Routes (`src/modules/curriculums/routes.ts`):

```typescript
import { Router, Request, Response } from "express";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requirePermission } from "../../middlewares/requirePermission.js";
import * as curriculumService from "./service.js";

const router = Router();

// All curriculum routes require authentication
router.use(requireAuth);

// POST /curriculums — Create (admin only)
router.post("/", requirePermission("curriculum:write"), async (req: Request, res: Response) => {
  const { name, description, image } = req.body;
  const curriculum = await curriculumService.create({ name, description, image });
  res.status(201).json({ message: "Curriculum created", data: curriculum });
});

// GET /curriculums — List (any authenticated user)
router.get("/", async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const search = req.query.search as string | undefined;

  const result = await curriculumService.list({ page, limit, search });
  res.json(result);
});

// GET /curriculums/:id — Get one
router.get("/:id", async (req: Request, res: Response) => {
  const id = BigInt(req.params.id);
  const curriculum = await curriculumService.getById(id);
  res.json({ data: curriculum });
});

// PUT /curriculums/:id — Update (admin only)
router.put("/:id", requirePermission("curriculum:write"), async (req: Request, res: Response) => {
  const id = BigInt(req.params.id);
  const { name, description, image } = req.body;
  const curriculum = await curriculumService.update(id, { name, description, image });
  res.json({ message: "Curriculum updated", data: curriculum });
});

// DELETE /curriculums/:id — Soft delete (admin only)
router.delete("/:id", requirePermission("curriculum:write"), async (req: Request, res: Response) => {
  const id = BigInt(req.params.id);
  await curriculumService.softDelete(id);
  res.json({ message: "Curriculum deleted" });
});

export default router;
```

**Notice how thin the routes are:** They only parse the request, call the service, and send the response. No business logic here.

---

## 5.4 Build the Grades Module

Grades have a foreign key to Curriculum. The service validates that the parent exists.

### Service (`src/modules/grades/service.ts`):

```typescript
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../utils/errors.js";

export async function create(data: {
  name: string;
  description?: string;
  image?: string;
  curriculumId: bigint;
}) {
  // Validate parent exists
  const curriculum = await prisma.curriculum.findFirst({
    where: { id: data.curriculumId, isDeleted: false },
  });
  if (!curriculum) {
    throw new AppError(404, "Curriculum not found");
  }

  return prisma.grade.create({ data });
}

export async function list(params: {
  page: number;
  limit: number;
  search?: string;
  curriculumId?: bigint;
}) {
  const { page, limit, search, curriculumId } = params;
  const skip = (page - 1) * limit;

  const where = {
    isDeleted: false,
    ...(curriculumId && { curriculumId }),
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  const [data, total] = await Promise.all([
    prisma.grade.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.grade.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getById(id: bigint) {
  const grade = await prisma.grade.findFirst({ where: { id, isDeleted: false } });
  if (!grade) throw new AppError(404, "Grade not found");
  return grade;
}

export async function update(
  id: bigint,
  data: { name?: string; description?: string; image?: string; curriculumId?: bigint }
) {
  const existing = await prisma.grade.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Grade not found");

  // If changing curriculum, validate it exists
  if (data.curriculumId) {
    const curriculum = await prisma.curriculum.findFirst({
      where: { id: data.curriculumId, isDeleted: false },
    });
    if (!curriculum) throw new AppError(404, "Curriculum not found");
  }

  return prisma.grade.update({ where: { id }, data });
}

export async function softDelete(id: bigint) {
  const existing = await prisma.grade.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Grade not found");
  return prisma.grade.update({ where: { id }, data: { isDeleted: true } });
}
```

### Routes (`src/modules/grades/routes.ts`):

Follow the exact same pattern as curriculums, but:
- Permission: `"grade:write"`
- Parse `curriculumId` from body (create/update) and query (list)
- Convert `curriculumId` to `BigInt()` before passing to service

---

## 5.5 Build the Subjects Module

Subjects have a foreign key to Grade. Same pattern as Grades.

- Permission: `"subject:write"`
- Foreign key: `gradeId`
- List filter: `gradeId` (optional)
- Validate parent Grade exists on create/update

---

## 5.6 Build the Chapters Module

Chapters have a foreign key to Subject. Slightly different because of extra fields.

Key differences from Curriculums:
- Has `title` (not `name`), `sortOrder`, `imageUrl`, `label`, `content`, `teacherGuide`
- Ordered by `sortOrder ASC` (not `createdAt DESC`)
- Search matches both `title` and `label`
- Permission: `"chapter:write"`

---

## 5.7 Mount All Routes

In `src/app.ts`:

```typescript
import curriculumRoutes from "./modules/curriculums/routes.js";
import gradeRoutes from "./modules/grades/routes.js";
import subjectRoutes from "./modules/subjects/routes.js";
import chapterRoutes from "./modules/chapters/routes.js";

app.use("/api/v1/curriculums", curriculumRoutes);
app.use("/api/v1/grades", gradeRoutes);
app.use("/api/v1/subjects", subjectRoutes);
app.use("/api/v1/chapters", chapterRoutes);
```

---

## 5.8 The Data Hierarchy

```
Curriculum: "Nigerian Curriculum"
  └── Grade: "Grade 1"
       └── Subject: "Mathematics"
            └── Chapter: "Introduction to Numbers" (sortOrder: 1)
            └── Chapter: "Addition" (sortOrder: 2)
            └── Chapter: "Subtraction" (sortOrder: 3)
       └── Subject: "English"
            └── Chapter: "The Alphabet" (sortOrder: 1)
  └── Grade: "Grade 2"
       └── ...
```

Each level validates its parent exists before creation. This prevents orphaned data.

---

## 5.9 Test the Full CRUD

```bash
# 1. Register as admin (you'll need to manually update userType in DB or set it in register)
# 2. Login to get access token

# Create curriculum
curl -X POST http://localhost:4000/api/v1/curriculums \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Nigerian Curriculum","description":"National curriculum"}'

# List curriculums
curl http://localhost:4000/api/v1/curriculums \
  -H "Authorization: Bearer <token>"

# Create grade under curriculum
curl -X POST http://localhost:4000/api/v1/grades \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Grade 1","curriculumId":"1"}'

# List grades filtered by curriculum
curl "http://localhost:4000/api/v1/grades?curriculumId=1" \
  -H "Authorization: Bearer <token>"
```

---

## Checkpoint

- [x] 4 CRUD modules (curriculums, grades, subjects, chapters)
- [x] Service layer pattern (routes → service → database)
- [x] Pagination (page, limit, totalPages)
- [x] Search (case-insensitive)
- [x] Soft delete
- [x] Foreign key validation (parent must exist)
- [x] Permission-based access control
- [x] 20 new endpoints (5 per module)

**Commit:** `git commit -m "add CRUD modules for curriculums, grades, subjects, chapters"`

---

## Key Concepts to Understand

1. **Service layer pattern** — Why separate routes from business logic: testability, reusability, separation of concerns
2. **Soft delete** — When to use soft delete vs hard delete. Soft delete is better when you need audit trails or data recovery.
3. **Pagination** — Offset-based (page/limit) vs cursor-based pagination. Offset is simpler but has issues with large datasets.
4. **Prisma query API** — Read: https://www.prisma.io/docs/orm/prisma-client/queries
5. **BigInt in JavaScript** — Why we need `BigInt()` conversion and JSON serialization workaround
