# 06 — Validation & Security

## Goal

Add Zod validation middleware, XSS sanitization, and the full security middleware stack (Helmet, CORS, rate limiting).

---

## 6.1 Install Dependencies

```bash
npm install zod xss express-rate-limit rate-limit-redis
```

| Package | Purpose |
|---------|---------|
| `zod` | Schema validation and type inference |
| `xss` | Sanitize user input to prevent XSS attacks |
| `express-rate-limit` | Limit repeated requests |
| `rate-limit-redis` | Redis store for rate limiter (shared across instances) |

---

## 6.2 Validation Middleware

Create `src/middlewares/validate.ts`:

```typescript
import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Validate request body
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        const errors = result.error.errors.map((e) => e.message);
        res.status(400).json({ message: "Validation error", errors });
        return;
      }
      req.body = result.data;
    }

    // Validate URL params (e.g., /curriculums/:id)
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        const errors = result.error.errors.map((e) => e.message);
        res.status(400).json({ message: "Validation error", errors });
        return;
      }
      req.params = result.data;
    }

    // Validate query params (e.g., ?page=1&limit=10)
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        const errors = result.error.errors.map((e) => e.message);
        res.status(400).json({ message: "Validation error", errors });
        return;
      }
      // Store parsed query on res.locals to avoid overwriting req.query
      // (req.query is a parsed-qs object, not a plain object)
      res.locals.query = result.data;
    }

    next();
  };
}
```

**Why `safeParse` instead of `parse`?**
- `parse` throws on failure — you'd need try/catch
- `safeParse` returns `{ success, data, error }` — cleaner control flow

**Why `res.locals.query`?**
- `req.query` is a special Express object (from `qs` parser). Overwriting it can cause issues.
- `res.locals` is a standard Express convention for passing data between middlewares.

---

## 6.3 Auth Schemas (with Zod)

Create `src/modules/auth/schemas.ts`:

```typescript
import { z } from "zod";

export const registerBody = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().trim().min(1, "Name is required"),
});

export const loginBody = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const refreshTokenBody = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const logoutBody = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});
```

Update `src/modules/auth/routes.ts` to use validation:

```typescript
import { validate } from "../../middlewares/validate.js";
import { registerBody, loginBody, refreshTokenBody, logoutBody } from "./schemas.js";

// POST /auth/register
router.post("/register", validate({ body: registerBody }), async (req, res) => {
  // req.body is now typed and validated
  const { email, password, name } = req.body;
  // ...
});
```

---

## 6.4 CRUD Schemas (with XSS Sanitization)

Create `src/modules/curriculums/schemas.ts`:

```typescript
import { z } from "zod";
import xss from "xss";
import { paginationQuery } from "../../schemas/shared.js";

// Helper: sanitize a string field to prevent XSS
const sanitize = (val: string) => xss(val);

export const createCurriculumBody = z.object({
  name: z.string().trim().min(1, "Name is required").transform(sanitize),
  description: z.string().transform(sanitize).optional(),
  image: z.string().optional(),
});

export const updateCurriculumBody = z.object({
  name: z.string().trim().min(1).transform(sanitize).optional(),
  description: z.string().transform(sanitize).optional(),
  image: z.string().optional(),
});

export const listCurriculumsQuery = paginationQuery;
```

**XSS sanitization:** The `xss` library converts dangerous characters:
- `<script>alert('xss')</script>` → `&lt;script&gt;alert('xss')&lt;/script&gt;`
- This prevents stored XSS attacks where malicious HTML is saved to the database and rendered to other users.

**When to sanitize:**
- Names, descriptions, labels — anything displayed to users
- NOT content/teacherGuide — these may contain rich HTML by design
- NOT URLs, IDs — they have their own validation

Do the same for grades, subjects, and chapters schemas. Each follows the same pattern but with module-specific fields.

---

## 6.5 Update Routes to Use Validation

```typescript
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { createCurriculumBody, updateCurriculumBody, listCurriculumsQuery } from "./schemas.js";

// POST /curriculums
router.post(
  "/",
  requirePermission("curriculum:write"),
  validate({ body: createCurriculumBody }),
  async (req, res) => {
    const curriculum = await curriculumService.create(req.body);
    res.status(201).json({ message: "Curriculum created", data: curriculum });
  }
);

// GET /curriculums
router.get("/", validate({ query: listCurriculumsQuery }), async (req, res) => {
  const { page, limit, search } = res.locals.query;
  const result = await curriculumService.list({ page, limit, search });
  res.json(result);
});

// GET /curriculums/:id
router.get("/:id", validate({ params: idParam }), async (req, res) => {
  const curriculum = await curriculumService.getById(req.params.id);
  res.json({ data: curriculum });
});

// PUT /curriculums/:id
router.put(
  "/:id",
  requirePermission("curriculum:write"),
  validate({ params: idParam, body: updateCurriculumBody }),
  async (req, res) => {
    const curriculum = await curriculumService.update(req.params.id, req.body);
    res.json({ message: "Curriculum updated", data: curriculum });
  }
);
```

---

## 6.6 Rate Limiting

Create `src/middlewares/rateLimiter.ts`:

```typescript
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis.js";
import { Request, Response, NextFunction } from "express";

// Helper: create Redis store if available
function createRedisStore(prefix: string) {
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: (...args: string[]) => redis!.call(...args) as any,
    prefix: `rl:${prefix}:`,
  });
}

// Global: 100 requests per 15 minutes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  store: createRedisStore("global"),
  message: { message: "Too many requests, please try again later" },
});

// Auth: 20 requests per 15 minutes (login/register)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  store: createRedisStore("auth"),
  message: { message: "Too many authentication attempts, please try again later" },
});

// Per-user: custom rate limit per authenticated user
export function userLimiter(maxRequests: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser || !redis) {
      next();
      return;
    }

    const key = `rl:user:${req.authUser.authId}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.pexpire(key, windowMs);
    }

    if (current > maxRequests) {
      res.status(429).json({ message: "Too many requests" });
      return;
    }

    next();
  };
}
```

**Three levels of rate limiting:**
1. **Global** — Protects entire API from abuse (DDoS, scraping)
2. **Auth-specific** — Prevents brute-force password guessing
3. **Per-user** — Prevents a single user from hogging resources

**Redis store** — Without Redis, rate limits are per-process (reset on restart, not shared between instances). Redis makes rate limits persistent and shared.

Apply in `src/app.ts`:

```typescript
import { globalLimiter, authLimiter } from "./middlewares/rateLimiter.js";

// Global rate limiter (after CORS, before routes)
app.use(globalLimiter);

// Auth-specific rate limiter on auth routes
app.use("/api/v1/auth", authLimiter, authRoutes);
```

---

## 6.7 Security Headers (Helmet)

Already added in guide 02, but understand what Helmet sets:

```
X-Content-Type-Options: nosniff        → Prevents MIME type sniffing
X-Frame-Options: SAMEORIGIN            → Prevents clickjacking
X-XSS-Protection: 0                    → Disables buggy browser XSS filter
Strict-Transport-Security: ...         → Forces HTTPS
Content-Security-Policy: ...           → Controls resource loading
Referrer-Policy: no-referrer           → Prevents referrer leaking
```

---

## 6.8 CORS Configuration

Already added in guide 02. Key settings:

```typescript
cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true, // Allow cookies/auth headers
})
```

- `origin` — Only allow requests from your frontend domain
- `credentials: true` — Required for sending auth cookies/headers cross-origin
- In production, set `FRONTEND_URL` to your actual frontend domain

---

## 6.9 Input Validation Layers

Your API now has multiple layers of protection:

```
Request arrives
  │
  ├── Rate limiter       → Too many requests? → 429
  ├── Helmet             → Sets security headers
  ├── CORS               → Wrong origin? → Blocked
  ├── express.json()     → Invalid JSON? → 400
  ├── validate(schemas)  → Invalid data? → 400 with errors
  │     ├── Zod validates types, formats, lengths
  │     └── xss() sanitizes strings
  ├── requireAuth        → No/bad token? → 401
  ├── requirePermission  → Wrong role? → 403
  └── Service layer      → Business logic validation (exists? conflict?)
```

---

## Checkpoint

- [x] Zod validation middleware (body, params, query)
- [x] XSS sanitization on user-facing text fields
- [x] Auth schemas (register, login, refresh, logout)
- [x] CRUD schemas with sanitization
- [x] Shared schemas (bigIntId, idParam, paginationQuery)
- [x] Rate limiting (global, auth, per-user)
- [x] Helmet security headers
- [x] CORS configuration

**Commit:** `git commit -m "add Zod validation, XSS sanitization, rate limiting"`

---

## Key Concepts to Understand

1. **Zod** — Schema validation library: https://zod.dev
2. **XSS attacks** — What they are and how to prevent them: https://owasp.org/www-community/attacks/xss/
3. **Rate limiting** — Why and how: https://blog.logrocket.com/rate-limiting-node-js/
4. **Defense in depth** — Multiple security layers: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
5. **CORS** — Why it exists: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
