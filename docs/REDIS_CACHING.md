# Redis Caching Guide

## What is Redis Caching?

Without caching, every API request queries the database:

```
Client → GET /api/v1/curriculums → PostgreSQL query → Response (50ms)
Client → GET /api/v1/curriculums → PostgreSQL query → Response (50ms)  ← same query again
```

With Redis caching, the first request queries the database and stores the result in Redis (in-memory). Subsequent requests get the cached result instantly:

```
Client → GET /api/v1/curriculums → PostgreSQL query → Store in Redis → Response (50ms)
Client → GET /api/v1/curriculums → Redis cache hit → Response (2ms)  ← 25x faster
```

When data changes (POST/PUT/DELETE), the cache is **invalidated** (deleted), so the next GET fetches fresh data from the database.

---

## How It Works in Our Project

### Step 1: Redis Client (`src/config/redis.ts`)

Creates a connection to Redis. If Redis is not available, the app still works — caching is just disabled.

```ts
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
```

### Step 2: Cache Utilities (`src/utils/cache.ts`)

Three functions:

```ts
// Read from cache
getCache(key)         → returns cached data or null

// Write to cache with expiry time (TTL)
setCache(key, data, ttlSeconds)  → stores data in Redis

// Delete cache entries matching a pattern
invalidateCache(pattern)  → deletes matching keys
```

### Step 3: Caching on GET Endpoints

Every GET list and GET detail endpoint follows this pattern:

```ts
router.get("/curriculums", async (req, res) => {
  // 1. Build a unique cache key from query params
  const cacheKey = `curriculums:list:${page}:${limit}:${search || "all"}`;

  // 2. Check cache first
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);  // ← Cache HIT, skip database

  // 3. Cache MISS — query database
  const items = await prisma.curriculum.findMany({ ... });

  // 4. Store result in cache for 5 minutes
  await setCache(cacheKey, response, 300);

  return res.json(response);
});
```

### Step 4: Invalidation on Write Endpoints

When data changes, we delete all cached entries for that module:

```ts
router.post("/curriculums", async (req, res) => {
  await prisma.curriculum.create({ ... });

  // Delete ALL curriculum cache entries
  await invalidateCache("curriculums:*");

  return res.status(201).json({ ... });
});
```

This ensures the next GET request fetches fresh data from the database.

---

## Cache Keys

Each cached response has a unique key based on the request parameters:

| Endpoint | Cache Key Example |
|----------|-------------------|
| `GET /curriculums?page=1&limit=10` | `curriculums:list:1:10:all` |
| `GET /curriculums?search=math` | `curriculums:list:1:10:math` |
| `GET /curriculums/5` | `curriculums:detail:5` |
| `GET /grades?curriculumId=1` | `grades:list:1:10:1:all` |
| `GET /chapters?subjectId=3&search=intro` | `chapters:list:1:10:3:intro` |

Different query params = different cache key = different cached response.

---

## TTL (Time To Live)

Cache entries automatically expire after a set time:

| Endpoint Type | TTL | Why |
|---------------|-----|-----|
| List endpoints (GET /curriculums) | 5 minutes (300s) | Lists change more often |
| Detail endpoints (GET /curriculums/:id) | 10 minutes (600s) | Single items change less often |

After TTL expires, the next request hits the database and re-caches the result.

---

## Cache Invalidation

When data changes, which cache entries get deleted:

| Action | Invalidates |
|--------|-------------|
| POST /curriculums | `curriculums:*` (all curriculum cache) |
| PUT /curriculums/:id | `curriculums:*` |
| DELETE /curriculums/:id | `curriculums:*` |
| POST /grades | `grades:*` |
| PUT /grades/:id | `grades:*` |
| DELETE /grades/:id | `grades:*` |
| POST /subjects | `subjects:*` |
| PUT /subjects/:id | `subjects:*` |
| DELETE /subjects/:id | `subjects:*` |
| POST /chapters | `chapters:*` |
| PUT /chapters/:id | `chapters:*` |
| DELETE /chapters/:id | `chapters:*` |

We use wildcard (`*`) to delete all entries for a module at once, because a single change (e.g., creating a new curriculum) affects all list pages.

---

## Running Redis

### Option 1: Docker (recommended)

```bash
docker compose up redis
```

Redis runs on `localhost:6379`.

### Option 2: Install locally

- **Mac:** `brew install redis && redis-server`
- **Windows:** Use Docker or WSL
- **Linux:** `sudo apt install redis-server && redis-server`

### Option 3: No Redis

Just don't start Redis. The app works fine without it — caching is automatically disabled. You'll see this log:

```
[Redis] Not available, caching disabled
```

---

## Environment Variable

Add to your `.env`:

```
REDIS_URL="redis://localhost:6379"
```

If not set, defaults to `redis://localhost:6379`.

---

## Testing

Redis is mocked in tests — no real Redis needed:

```ts
vi.mock("../config/redis.js", () => ({ redis: null }));
```

This means cache functions (`getCache`, `setCache`, `invalidateCache`) return immediately without doing anything, so tests always hit the mocked database.

---

## Files

| File | Purpose |
|------|---------|
| `src/config/redis.ts` | Redis client connection |
| `src/utils/cache.ts` | getCache, setCache, invalidateCache |
| `src/modules/*/routes.ts` | Cache on GET, invalidate on POST/PUT/DELETE |
| `docker-compose.yml` | Redis container |

---

## Summary

```
GET request → Check Redis cache → Hit? Return cached → Miss? Query DB → Cache result → Return
POST/PUT/DELETE → Execute DB operation → Invalidate related cache → Return
No Redis running → Skip caching → Everything works normally (just slower)
```
