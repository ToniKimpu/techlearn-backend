# Implementation Guide

Two independent improvements for the backend. Implement them in any order.

---

## 1. Rate Limit on `/auth/refresh-token`

### Why
The `/auth/login` and `/auth/register` endpoints are protected by `authLimiter` (20 requests per 15 min), but `/auth/refresh-token` has no limit. An attacker can hammer it indefinitely to try stolen tokens or exhaust Redis connections.

### What to add

**File: `src/middlewares/rateLimiter.ts`**

Add a new limiter below the existing `authLimiter`:

```typescript
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30,                 // 30 refreshes per 15 min per IP is generous for real users
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: createRedisStore("rl:refresh:"),
  message: { message: "Too many refresh attempts, please try again later" },
});
```

**File: `src/modules/auth/routes.ts`**

Import `refreshLimiter` and apply it:

```typescript
// Before (line 120):
router.post("/auth/refresh-token", async (req, res, next) => {

// After:
router.post("/auth/refresh-token", refreshLimiter, async (req, res, next) => {
```

That's it. Two lines of change total.

### Verify

```bash
# Hit the endpoint 31 times rapidly — the 31st should return 429
for i in $(seq 1 31); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/v1/auth/refresh-token
done
```

---

## 2. Generic CRUD Service Base Class

### Why

The four content services (curriculums, grades, subjects, chapters) share the same structure:
- `list()` — paginated query with cache
- `getById()` — single fetch with cache
- `update()` — existence check → update → invalidate cache
- `softDelete()` — existence check → set `isDeleted: true` → invalidate cache
- `create()` — insert → invalidate cache

This is ~300 lines of near-identical boilerplate. The base class extracts the shared logic so each module only defines what's unique.

### Step 1 — Create the base service

**New file: `src/utils/crudService.ts`**

```typescript
import type { PrismaClient } from "../../generated/prisma/index.js";
import { getCache, invalidateCache, setCache } from "./cache.js";
import { AppError } from "./errors.js";

type PrismaModel = {
  findFirst: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

export interface CrudServiceOptions<TListInput extends { page: number; limit: number; search?: string }> {
  /** Prisma delegate, e.g. prisma.curriculum */
  model: PrismaModel;

  /** Cache key prefix, e.g. "curriculums" → keys like "curriculums:list:..." */
  cachePrefix: string;

  /** Human-readable entity name for 404 messages, e.g. "Curriculum" */
  entityName: string;

  /** Build the Prisma `where` object from list params */
  buildWhere: (params: TListInput) => Record<string, unknown>;

  /** Build a unique cache key suffix from list params (beyond page/limit/search) */
  listCacheKey?: (params: TListInput) => string;

  /** Prisma `include` or `select` to pass to findMany */
  listInclude?: (params: TListInput) => Record<string, unknown> | undefined;

  /** Transform each item before returning in list (e.g. flatten _count) */
  transformItem?: (item: any, params: TListInput) => any;

  /** Cache TTL in seconds for list queries (default: 300) */
  listTtl?: number;

  /** Cache TTL in seconds for detail queries (default: 600) */
  detailTtl?: number;
}

export function createCrudService<
  TCreateInput,
  TUpdateInput,
  TListInput extends { page: number; limit: number; search?: string },
>(opts: CrudServiceOptions<TListInput>) {
  const listTtl = opts.listTtl ?? 300;
  const detailTtl = opts.detailTtl ?? 600;

  async function list(params: TListInput) {
    const extra = opts.listCacheKey?.(params) ?? "";
    const cacheKey = `${opts.cachePrefix}:list:${params.page}:${params.limit}:${params.search || "all"}${extra}`;

    const { data: cached } = await getCache(cacheKey);
    if (cached) return { cached: true, data: cached };

    const where = opts.buildWhere(params);
    const include = opts.listInclude?.(params);

    const [items, total] = await Promise.all([
      opts.model.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        ...(include ? { include } : {}),
      }),
      opts.model.count({ where }),
    ]);

    const data = opts.transformItem
      ? items.map((item: any) => opts.transformItem!(item, params))
      : items;

    const response = {
      data,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };

    await setCache(cacheKey, response, listTtl);
    return { cached: false, data: response };
  }

  async function getById(id: bigint) {
    const cacheKey = `${opts.cachePrefix}:detail:${id}`;
    const { data: cached } = await getCache(cacheKey);
    if (cached) return { cached: true, data: cached };

    const item = await opts.model.findFirst({ where: { id, isDeleted: false } });
    if (!item) throw new AppError(404, `${opts.entityName} not found`);

    const response = { data: item };
    await setCache(cacheKey, response, detailTtl);
    return { cached: false, data: response };
  }

  async function softDelete(id: bigint) {
    const existing = await opts.model.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new AppError(404, `${opts.entityName} not found`);

    await opts.model.update({ where: { id }, data: { isDeleted: true } });
    await invalidateCache(`${opts.cachePrefix}:*`);
  }

  return { list, getById, softDelete };
}
```

> **Note:** `create` and `update` are NOT in the base class. They differ too much between modules (foreign key validation, unique constraint handling, image fields, etc.). Keep them in each service — only extract what's truly identical.

---

### Step 2 — Refactor `curriculumService` to use it

**File: `src/modules/curriculums/service.ts`**

```typescript
import { Prisma } from "../../../generated/prisma/index.js";
import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { AppError } from "../../utils/errors.js";
import { createCrudService } from "../../utils/crudService.js";

type CreateInput = { name: string; description?: string; image?: string };
type UpdateInput = { name?: string; description?: string; image?: string };
type ListInput = { page: number; limit: number; search?: string };

const base = createCrudService<CreateInput, UpdateInput, ListInput>({
  model: prisma.curriculum,
  cachePrefix: "curriculums",
  entityName: "Curriculum",
  buildWhere: ({ search }) => ({
    isDeleted: false,
    ...(search
      ? { OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ]}
      : {}),
  }),
});

async function create(data: CreateInput) {
  try {
    const curriculum = await prisma.curriculum.create({
      data: {
        name: data.name,
        description: data.description || null,
        image: data.image || "",
      },
    });
    await invalidateCache("curriculums:*");
    return curriculum;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Curriculum name already exists");
    }
    throw err;
  }
}

async function update(id: bigint, data: UpdateInput) {
  try {
    const existing = await prisma.curriculum.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new AppError(404, "Curriculum not found");

    const updated = await prisma.curriculum.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.image !== undefined ? { image: data.image } : {}),
      },
    });

    await invalidateCache("curriculums:*");
    return updated;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Curriculum name already exists");
    }
    throw err;
  }
}

export const curriculumService = {
  ...base,
  create,
  update,
};
```

---

### Step 3 — Refactor `gradeService` to use it

**File: `src/modules/grades/service.ts`**

```typescript
import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { AppError } from "../../utils/errors.js";
import { createCrudService } from "../../utils/crudService.js";

type CreateInput = { name: string; description?: string; image?: string; curriculumId: string };
type UpdateInput = { name?: string; description?: string; image?: string; curriculumId?: string };
type ListInput = {
  page: number;
  limit: number;
  search?: string;
  curriculumId?: string;
  include?: "subjects";
};

const base = createCrudService<CreateInput, UpdateInput, ListInput>({
  model: prisma.grade,
  cachePrefix: "grades",
  entityName: "Grade",
  buildWhere: ({ search, curriculumId }) => ({
    isDeleted: false,
    ...(curriculumId ? { curriculumId: BigInt(curriculumId) } : {}),
    ...(search
      ? { OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ]}
      : {}),
  }),
  listCacheKey: ({ curriculumId, include }) =>
    `:${curriculumId || "all"}:${include || "none"}`,
  listInclude: ({ include }) =>
    include === "subjects"
      ? { subjects: { where: { isDeleted: false } }, curriculum: { select: { name: true } } }
      : { _count: { select: { subjects: { where: { isDeleted: false } } } }, curriculum: { select: { name: true } } },
  transformItem: (item, { include }) => {
    const { _count, ...grade } = item;
    return include === "subjects" ? grade : { ...grade, subjectCount: _count?.subjects ?? 0 };
  },
});

async function create(data: CreateInput) {
  const curriculum = await prisma.curriculum.findFirst({
    where: { id: BigInt(data.curriculumId), isDeleted: false },
  });
  if (!curriculum) throw new AppError(404, "Curriculum not found");

  const grade = await prisma.grade.create({
    data: {
      name: data.name,
      description: data.description || null,
      image: data.image || null,
      curriculumId: BigInt(data.curriculumId),
    },
  });

  await invalidateCache("grades:*");
  return grade;
}

async function update(id: bigint, data: UpdateInput) {
  const existing = await prisma.grade.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Grade not found");

  if (data.curriculumId !== undefined) {
    const curriculum = await prisma.curriculum.findFirst({
      where: { id: BigInt(data.curriculumId), isDeleted: false },
    });
    if (!curriculum) throw new AppError(404, "Curriculum not found");
  }

  const updated = await prisma.grade.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.image !== undefined ? { image: data.image || null } : {}),
      ...(data.curriculumId !== undefined ? { curriculumId: BigInt(data.curriculumId) } : {}),
    },
  });

  await invalidateCache("grades:*");
  return updated;
}

export const gradeService = {
  ...base,
  create,
  update,
};
```

---

### Step 4 — Repeat for subjects and chapters

Apply the same pattern to `src/modules/subjects/service.ts` and `src/modules/chapters/service.ts`:

1. Create `const base = createCrudService({ ... })` with module-specific `buildWhere`, `listCacheKey`, `listInclude`, `transformItem`
2. Keep `create` and `update` as standalone functions (they have module-specific logic)
3. Export `{ ...base, create, update }`

The `buildWhere` for subjects will filter by `gradeId` and `curriculumId`.
The `buildWhere` for chapters will filter by `subjectId`, `gradeId`, `curriculumId`.

---

### Verify after refactoring

Run the existing test suite to make sure nothing broke:

```bash
cd techlearn-backend
npm test
```

All existing tests in `src/__tests__/curriculums.test.ts` should still pass unchanged — the public API of each service (function names, parameters, return shapes) is identical. Only the internal implementation changed.

---

## Summary

| Task | Files Changed | Effort |
|------|--------------|--------|
| Rate limit refresh | `rateLimiter.ts` + `auth/routes.ts` | ~5 min |
| CRUD base class | New `utils/crudService.ts` + 4 service files | ~45 min |
