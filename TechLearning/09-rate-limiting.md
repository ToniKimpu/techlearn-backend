# 09 — Rate Limiting

## What is rate limiting?

Rate limiting caps the number of requests a client can make within a time window. Once the limit is hit, the server returns `429 Too Many Requests`.

```
Without rate limiting:
  Attacker sends 10,000 login attempts per second → brute-forces passwords

With rate limiting:
  After 20 attempts in 15 minutes → blocked → attack fails
```

---

## How this project implements rate limiting

The logic is in [`src/middlewares/rateLimiter.ts`](../src/middlewares/rateLimiter.ts).

### Global limiter — applies to all routes

```ts
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,               // 100 requests per window
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: createRedisStore("rl:global:"), // Redis-backed counter
  message: { message: "Too many requests, please try again later" },
});

// Applied in src/app.ts
app.use(globalLimiter);
```

### Auth limiter — tighter limit for login/register

```ts
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,                // only 20 attempts per window
  store: createRedisStore("rl:auth:"),
});
```

Used in the auth routes:
```ts
router.post("/auth/login", authLimiter, validate({ body: loginBody }), ...);
router.post("/auth/register", authLimiter, validate({ body: registerBody }), ...);
```

### Per-user limiter — limits authenticated users by ID

```ts
export function userLimiter(maxRequests: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.authUser?.authId;
    if (!userId || !redis) return next();

    const key = `rl:user:${userId}`; // unique key per user
    const count = await redis.incr(key); // atomic increment
    if (count === 1) await redis.pexpire(key, windowMs); // set TTL on first hit

    if (count > maxRequests) {
      return res.status(429).json({ message: "Too many requests, please try again later" });
    }
    return next();
  };
}
```

This limits each **user** regardless of IP — useful for preventing abuse from authenticated accounts.

### Redis store — shared across multiple server instances

```ts
function createRedisStore(prefix: string) {
  if (!redis) return undefined; // falls back to in-memory if Redis unavailable
  const client = redis;

  return new RedisStore({
    sendCommand: (...args: string[]) => client.call(args[0], ...args.slice(1)) as any,
    prefix,
  });
}
```

Why Redis matters here: if you have 3 server instances running, an in-memory counter is per-instance. An attacker could send 20 requests to each instance and effectively get 60. Redis stores the counter centrally, so all instances share the same count.

---

## How `express-rate-limit` works

Each incoming request:
1. Generates a key (default: the client's IP address)
2. Looks up the counter for that key in Redis
3. Increments the counter
4. If counter > limit → return 429
5. Otherwise → call `next()`

The key is prefixed (`rl:global:`, `rl:auth:`) so different limiters don't interfere.

### Response headers sent

```
RateLimit-Limit: 100
RateLimit-Remaining: 73
RateLimit-Reset: 2026-03-11T15:30:00.000Z
```

These headers let clients know how many requests they have left and when the window resets.

---

## Step-by-step practice

**Task 1 — Set up a strict rate limiter and hit it**

```ts
import express from "express";
import rateLimit from "express-rate-limit";

const app = express();

const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 5,            // only 5 requests per minute
  message: { error: "Too many requests. Try again in a minute." },
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.get("/data", strictLimiter, (_req, res) => {
  res.json({ message: "Here is your data" });
});

app.listen(3001);
```

Hit it 6 times:
```bash
for i in {1..6}; do
  curl -s http://localhost:3001/data | jq .
done
```

You should see the first 5 succeed and the 6th return an error.

**Task 2 — Inspect rate limit headers**

```bash
curl -I http://localhost:3001/data
# Look for:
# RateLimit-Limit: 5
# RateLimit-Remaining: 4
# RateLimit-Reset: ...
```

**Task 3 — Per-IP vs per-user limiting**

Notice that `express-rate-limit` defaults to using the IP address as the key. This is fine for anonymous routes but not ideal for authenticated ones.

Two users behind the same corporate NAT share an IP → one user's heavy usage blocks the other.

The `userLimiter` in this project solves this by keying on `userId`:

```ts
// Simulated per-user limiter
const counters = new Map<string, number>();

function userLimiter(max: number) {
  return (req: any, res: any, next: any) => {
    const userId = req.headers["x-user-id"] || "anonymous";
    const count = (counters.get(userId) || 0) + 1;
    counters.set(userId, count);

    if (count > max) {
      return res.status(429).json({ error: "You made too many requests" });
    }
    next();
  };
}

app.get("/api", userLimiter(3), (_, res) => res.json({ ok: true }));
```

Test with different user IDs:
```bash
# User A — 4 requests (blocked on 4th)
for i in {1..4}; do curl -H "X-User-Id: user_a" http://localhost:3001/api; done

# User B — not blocked
curl -H "X-User-Id: user_b" http://localhost:3001/api
```

---

## Key takeaways

- Rate limiting protects against brute-force attacks and API abuse
- This project has 3 limiters: global (100 req/15min), auth (20 req/15min), per-user (by userId)
- Redis stores the counters centrally so multiple server instances share state
- `express-rate-limit` defaults to IP-based limiting; this project adds user-based limiting for authenticated routes
- Always apply a tighter limit on auth routes (login, register, password reset)
