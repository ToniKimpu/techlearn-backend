# 10 — Redis + ioredis

## What is Redis?

Redis (Remote Dictionary Server) is an **in-memory key-value store**. Think of it as a giant hash map that runs as a separate process and can be accessed over the network.

```
Redis stores data in RAM → reads/writes take microseconds
PostgreSQL stores data on disk → reads/writes take milliseconds
```

That makes Redis 100–1000× faster than a database for simple lookups.

---

## What Redis is used for in this project

| Use case | Where |
|---|---|
| API response caching | `src/utils/cache.ts` |
| Rate limit counters | `src/middlewares/rateLimiter.ts` |
| Refresh token storage | auth module |
| BullMQ job queue | `src/config/queue.ts` |

---

## How this project connects to Redis

[`src/config/redis.ts`](../src/config/redis.ts):

```ts
import { Redis } from "ioredis";
import { logger } from "../utils/logger.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;

try {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: () => null, // don't retry forever on startup
    lazyConnect: true,
  });

  client.on("error", () => {}); // suppress error noise during startup
  await client.connect();
  redis = client;
  logger.info("[Redis] Connected");
} catch {
  logger.warn("[Redis] Not available, caching disabled");
  redis = null; // graceful degradation — app still works without Redis
}

export { redis };
```

Key design decision: Redis is **optional**. If it's unavailable, the app runs without caching, rate limit persistence, or queues. This is called **graceful degradation**.

---

## The cache utility

[`src/utils/cache.ts`](../src/utils/cache.ts):

```ts
// Read from cache
export async function getCache<T>(key: string): Promise<CacheResult<T>> {
  if (!redis) return { data: null, hit: false };

  const raw = await redis.get(key);
  if (raw) {
    return { data: JSON.parse(raw), hit: true };
  }
  return { data: null, hit: false };
}

// Write to cache with TTL (time to live)
export async function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
  //                                           ↑   ↑
  //                                      expire  seconds
}

// Delete by pattern (e.g. "curriculum:*" to clear all curriculum caches)
export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;

  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}
```

---

## Core Redis commands

```ts
// Store a value
await redis.set("key", "value");
await redis.set("key", "value", "EX", 60); // expires in 60 seconds

// Read a value
const value = await redis.get("key"); // returns string or null

// Delete
await redis.del("key");
await redis.del("key1", "key2", "key3"); // delete multiple

// Check if exists
const exists = await redis.exists("key"); // 1 or 0

// Store a number and increment atomically
await redis.set("counter", "0");
await redis.incr("counter"); // 1
await redis.incr("counter"); // 2
await redis.incrby("counter", 5); // 7

// Set expiry on an existing key
await redis.expire("key", 300);  // seconds
await redis.pexpire("key", 300); // milliseconds

// Scan keys matching a pattern (never use KEYS in production — it blocks)
const [cursor, keys] = await redis.scan("0", "MATCH", "user:*", "COUNT", 100);

// Store JSON
await redis.set("user:1", JSON.stringify({ name: "Alice", role: "admin" }));
const raw = await redis.get("user:1");
const user = JSON.parse(raw!);
```

---

## The cache-aside pattern

This is the most common caching strategy used in this project:

```
1. Request comes in
2. Check Redis for cached data
3a. Cache HIT  → return cached data immediately (fast)
3b. Cache MISS → fetch from database → store in Redis → return data
```

```ts
// Example: caching a curriculum list
async function getCurriculums(page: number) {
  const cacheKey = `curriculum:list:page:${page}`;

  // 1. Try cache first
  const { data, hit } = await getCache<Curriculum[]>(cacheKey);
  if (hit) {
    return data; // served from Redis — no DB call
  }

  // 2. Cache miss → fetch from DB
  const curriculums = await prisma.curriculum.findMany({
    skip: (page - 1) * 20,
    take: 20,
  });

  // 3. Store in cache for 5 minutes
  await setCache(cacheKey, curriculums, 300);

  return curriculums;
}
```

When a curriculum is updated, you invalidate the cache:
```ts
await invalidateCache("curriculum:*");
```

---

## TTL (Time to Live)

Every cached value should have an expiry. If it doesn't, it lives in Redis forever and the data becomes stale.

```
Short TTL (30–60s):  For data that changes frequently (user sessions, counters)
Medium TTL (5–30m):  For data that changes occasionally (list pages, search results)
Long TTL (1h+):      For data that rarely changes (static configs, reference data)
```

---

## Step-by-step practice

**Task 1 — Basic Redis operations**

Connect to Redis and run these commands (use `redis-cli` or a Node.js script):

```ts
import { Redis } from "ioredis";
const redis = new Redis();

await redis.set("greeting", "hello world");
const val = await redis.get("greeting");
console.log(val); // "hello world"

// With TTL
await redis.set("temp", "gone soon", "EX", 5);
console.log(await redis.get("temp")); // "gone soon"
await new Promise(r => setTimeout(r, 6000));
console.log(await redis.get("temp")); // null

// Counter
await redis.set("visits", "0");
await redis.incr("visits");
await redis.incr("visits");
await redis.incr("visits");
console.log(await redis.get("visits")); // "3"

await redis.quit();
```

**Task 2 — Implement cache-aside for a simulated DB call**

```ts
import { Redis } from "ioredis";
const redis = new Redis();

// Simulate an expensive DB query
async function slowDbQuery(id: number) {
  await new Promise(r => setTimeout(r, 500)); // 500ms delay
  return { id, name: `Product ${id}`, price: id * 10 };
}

async function getProduct(id: number) {
  const key = `product:${id}`;

  // Check cache
  const cached = await redis.get(key);
  if (cached) {
    console.log(`[CACHE HIT] product:${id}`);
    return JSON.parse(cached);
  }

  // Fetch from DB
  console.log(`[CACHE MISS] fetching from DB...`);
  const product = await slowDbQuery(id);

  // Store in cache for 60 seconds
  await redis.set(key, JSON.stringify(product), "EX", 60);

  return product;
}

// First call — slow (500ms)
console.time("first");
await getProduct(42);
console.timeEnd("first");

// Second call — fast (< 5ms)
console.time("second");
await getProduct(42);
console.timeEnd("second");

await redis.quit();
```

**Task 3 — Observe cache invalidation**

```ts
// Add this to the code above:
async function updateProduct(id: number, name: string) {
  // Update the DB (simulated)
  console.log(`Updated product ${id} in DB`);

  // Invalidate the cache so next read gets fresh data
  await redis.del(`product:${id}`);
  console.log(`Cache cleared for product:${id}`);
}

await updateProduct(42, "New Name");
await getProduct(42); // fetches from DB again (cache was cleared)
```

---

## Key takeaways

- Redis stores data in RAM — orders of magnitude faster than a relational database
- In this project, Redis is optional — the app degrades gracefully without it
- Cache-aside pattern: check cache first, fall back to DB on miss, write back to cache
- Always set a TTL on cached values to prevent stale data
- `incr` is atomic — safe for counters even under concurrent access
- Use `scan` (not `keys`) for pattern-matching in production — `keys` blocks the server
