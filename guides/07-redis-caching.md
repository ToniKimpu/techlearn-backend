# 07 — Redis Caching

## Goal

Add Redis for caching API responses, with cache invalidation on writes and X-Cache headers.

---

## 7.1 Install & Start Redis

```bash
npm install ioredis
```

Add Redis to `docker-compose.yml`:

```yaml
services:
  db:
    # ... (already configured)

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/var/lib/postgresql/data

volumes:
  pgdata:
  redisdata:
```

```bash
docker compose up -d redis
```

---

## 7.2 Redis Client

Create `src/config/redis.ts`:

```typescript
import Redis from "ioredis";
import logger from "../utils/logger.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Parse connection options (BullMQ needs them separately)
const url = new URL(REDIS_URL);
export const redisConnectionOptions = {
  host: url.hostname,
  port: parseInt(url.port) || 6379,
  password: url.password || undefined,
  maxRetriesPerRequest: null as null, // Required for BullMQ
};

// Create the Redis client
let redis: Redis | null = null;

try {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: () => null, // Don't retry — fail fast
    lazyConnect: true,         // Don't connect until first command
  });

  await client.connect();
  logger.info("Redis connected");
  redis = client;

  // Suppress error events (prevent unhandled rejection crashes)
  client.on("error", () => {});
} catch {
  logger.warn("Redis not available — running without cache");
  redis = null;
}

export { redis };
```

**Key design: graceful degradation.** If Redis is down, the app still works — just without caching. This is critical. Your app should never crash because a cache is unavailable.

**`maxRetriesPerRequest: null`** — BullMQ requires this setting. It means "retry forever" for queue operations (which makes sense for a job queue but not for web requests).

**`lazyConnect: true`** — Don't try to connect when the client is created. Connect on the first command. This prevents startup delays.

---

## 7.3 Cache Utility

Create `src/utils/cache.ts`:

```typescript
import { redis } from "../config/redis.js";

export interface CacheResult<T> {
  data: T | null;
  hit: boolean;
}

// GET from cache
export async function getCache<T>(key: string): Promise<CacheResult<T>> {
  if (!redis) return { data: null, hit: false };

  const cached = await redis.get(key);
  if (cached) {
    return { data: JSON.parse(cached) as T, hit: true };
  }
  return { data: null, hit: false };
}

// SET in cache with TTL
export async function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
}

// INVALIDATE cache by pattern (e.g., "curriculums:*")
export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;

  // SCAN for matching keys (safe for production — doesn't block)
  const stream = redis.scanStream({ match: pattern, count: 100 });
  stream.on("data", async (keys: string[]) => {
    if (keys.length > 0) {
      await redis!.del(...keys);
    }
  });
}
```

**Cache key convention:** `{module}:{operation}:{params}`
- `curriculums:list:1:10:` — Page 1, limit 10, no search
- `curriculums:list:1:10:math` — Page 1, limit 10, search "math"
- `curriculums:detail:5` — Curriculum with ID 5
- `curriculums:*` — Wildcard for invalidation

**TTL (Time To Live):**
- List endpoints: 5 minutes (300 seconds) — data changes less frequently
- Detail endpoints: 10 minutes (600 seconds) — single record is stable
- After any write (create/update/delete), invalidate ALL cache for that module

---

## 7.4 Add Caching to Services

Update `src/modules/curriculums/service.ts`:

```typescript
import { getCache, setCache, invalidateCache } from "../../utils/cache.js";

const CACHE_PREFIX = "curriculums";
const LIST_TTL = 300;   // 5 minutes
const DETAIL_TTL = 600; // 10 minutes

// LIST with caching
export async function list(params: { page: number; limit: number; search?: string }) {
  const { page, limit, search } = params;
  const cacheKey = `${CACHE_PREFIX}:list:${page}:${limit}:${search || ""}`;

  // 1. Check cache first
  const cached = await getCache(cacheKey);
  if (cached.hit) {
    return { ...cached.data, fromCache: true };
  }

  // 2. Cache miss — query database
  const skip = (page - 1) * limit;
  const where = {
    isDeleted: false,
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  const [data, total] = await Promise.all([
    prisma.curriculum.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.curriculum.count({ where }),
  ]);

  const result = {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };

  // 3. Store in cache
  await setCache(cacheKey, result, LIST_TTL);

  return { ...result, fromCache: false };
}

// GET BY ID with caching
export async function getById(id: bigint) {
  const cacheKey = `${CACHE_PREFIX}:detail:${id}`;

  const cached = await getCache(cacheKey);
  if (cached.hit) {
    return { data: cached.data, fromCache: true };
  }

  const curriculum = await prisma.curriculum.findFirst({
    where: { id, isDeleted: false },
  });
  if (!curriculum) throw new AppError(404, "Curriculum not found");

  await setCache(cacheKey, curriculum, DETAIL_TTL);
  return { data: curriculum, fromCache: false };
}

// CREATE — invalidate cache
export async function create(data: { name: string; description?: string; image?: string }) {
  const curriculum = await prisma.curriculum.create({ data });
  await invalidateCache(`${CACHE_PREFIX}:*`); // Clear all curriculum cache
  return curriculum;
}

// UPDATE — invalidate cache
export async function update(id: bigint, data: any) {
  // ... existing logic ...
  const updated = await prisma.curriculum.update({ where: { id }, data });
  await invalidateCache(`${CACHE_PREFIX}:*`);
  return updated;
}

// DELETE — invalidate cache
export async function softDelete(id: bigint) {
  // ... existing logic ...
  await prisma.curriculum.update({ where: { id }, data: { isDeleted: true } });
  await invalidateCache(`${CACHE_PREFIX}:*`);
}
```

---

## 7.5 X-Cache Response Header

In your routes, set the `X-Cache` header so clients (and you during debugging) can see if the response was cached:

```typescript
// In routes.ts:
router.get("/", async (req, res) => {
  const result = await curriculumService.list(/* ... */);
  res.set("X-Cache", result.fromCache ? "HIT" : "MISS");
  res.json(result);
});
```

When you test with curl or Postman, you'll see:
- First request: `X-Cache: MISS` (fetched from database)
- Second request: `X-Cache: HIT` (served from Redis)

---

## 7.6 Update Health Check

In `src/app.ts`, add Redis to the health check:

```typescript
import { redis } from "./config/redis.js";

app.get("/health", async (_req, res) => {
  const health: Record<string, string> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database = "ok";
  } catch {
    health.database = "error";
  }

  try {
    if (redis) {
      await redis.ping();
      health.redis = "ok";
    } else {
      health.redis = "not configured";
    }
  } catch {
    health.redis = "error";
  }

  const isHealthy = health.database === "ok";
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    uptime: process.uptime(),
    checks: health,
  });
});
```

---

## 7.7 Cache Invalidation Strategy

```
Operation        → Cache Action
────────────────────────────────────
Create           → invalidateCache("module:*")
Update           → invalidateCache("module:*")
Soft Delete      → invalidateCache("module:*")
List             → getCache → if miss → setCache (5 min)
Get By ID        → getCache → if miss → setCache (10 min)
```

**Why invalidate ALL keys on write?** It's simple and correct. A more granular approach (only invalidate affected pages) is complex and error-prone. For this scale, clearing all cache on write is fine.

**Cache stampede protection:** Not implemented here, but worth knowing — if the cache expires and 100 requests hit simultaneously, all 100 query the database. Solutions: mutex lock, stale-while-revalidate.

---

## 7.8 Update Graceful Shutdown

In `src/server.ts`:

```typescript
import { redis } from "./config/redis.js";

// In shutdown function:
redis?.disconnect();
```

---

## Checkpoint

- [x] Redis client with graceful degradation
- [x] Cache utility (get, set, invalidate)
- [x] Caching on list and detail endpoints (5-min / 10-min TTL)
- [x] Cache invalidation on create/update/delete
- [x] X-Cache header for debugging
- [x] Redis health check
- [x] Graceful Redis disconnect on shutdown

**Commit:** `git commit -m "add Redis caching with invalidation and X-Cache headers"`

---

## Key Concepts to Understand

1. **Cache-aside pattern** — Check cache → miss → query DB → store in cache. Read: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
2. **TTL (Time To Live)** — How long cached data is valid. Balance freshness vs performance.
3. **Cache invalidation** — "There are only two hard things in CS: cache invalidation and naming things." Read why it's hard.
4. **Redis data types** — Strings, hashes, lists, sets. We use strings (simplest). Read: https://redis.io/docs/data-types/
5. **SCAN vs KEYS** — SCAN iterates safely; KEYS blocks. Never use KEYS in production.
