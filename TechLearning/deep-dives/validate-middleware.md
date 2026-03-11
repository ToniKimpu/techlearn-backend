# Deep Dive — `validate` Middleware

> File: `src/middlewares/validate.ts`

---

## What problem does this solve?

Without a validation layer, every controller has to manually check every incoming field:

```ts
// WITHOUT validate — messy, repetitive, easy to miss
async function loginController(req, res) {
  if (!req.body.email) return res.status(400).json({ message: "email required" });
  if (typeof req.body.email !== "string") return res.status(400).json({ message: "email must be string" });
  if (!req.body.email.includes("@")) return res.status(400).json({ message: "invalid email" });
  if (!req.body.password) return res.status(400).json({ message: "password required" });
  if (req.body.password.length < 6) return res.status(400).json({ message: "password too short" });
  // ... finally, the actual business logic:
  const user = await prisma.authUser.findUnique(...);
}
```

With `validate`, all of that disappears from the controller:

```ts
// WITH validate — controller only handles business logic
router.post("/auth/login", validate({ body: loginBody }), loginController);

async function loginController(req, res) {
  // req.body.email is GUARANTEED to be a valid email string
  // req.body.password is GUARANTEED to be a non-empty string
  const user = await prisma.authUser.findUnique(...);
}
```

---

## The "middleware factory" pattern

`validate` is not middleware itself — it is a **function that returns middleware**:

```ts
export function validate(schemas: ValidateSchemas) {  // outer — called with config
  return (req, res, next) => {                         // inner — the actual middleware
    ...
  };
}
```

This lets you pass different schemas per route:

```ts
validate({ body: loginBody })                        // login route
validate({ body: registerBody })                     // register route
validate({ query: paginationQuery })                 // list route
validate({ params: idParam, body: updateBody })      // update route
validate({ params: idParam })                        // delete/get-by-id route
```

Compare to a regular middleware which cannot be configured:

```ts
// Regular middleware — no config possible
app.use(helmet);

// Factory middleware — configurable per route
app.use(validate({ body: loginBody }));
```

---

## Full source code with annotations

```ts
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

// What you can pass to validate()
// All three fields are optional — only validate what you need
interface ValidateSchemas {
  body?: z.ZodType;    // validates req.body
  query?: z.ZodType;   // validates req.query → result stored in res.locals.query
  params?: z.ZodType;  // validates req.params
}

export function validate(schemas: ValidateSchemas) {
  // Returns the actual Express middleware
  return (req: Request, res: Response, next: NextFunction) => {
    try {

      // ── 1. Validate URL path params (/users/:id) ──────────────────
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
        // parse() throws ZodError if invalid
        // On success, req.params is overwritten with coerced values
      }

      // ── 2. Validate query string (?page=1&limit=10) ───────────────
      if (schemas.query) {
        res.locals.query = schemas.query.parse(req.query);
        // Stored in res.locals, NOT req.query
        // (TypeScript won't allow writing coerced types back to req.query)
      }

      // ── 3. Validate request body ──────────────────────────────────
      if (schemas.body) {
        if (req.body === undefined) {
          // express.json() only parses body when Content-Type: application/json is set
          // If that header is missing, req.body is undefined
          return res.status(400).json({
            message: "Request body is missing. Ensure Content-Type: application/json is set.",
          });
        }
        req.body = schemas.body.parse(req.body);
        // On success, req.body is overwritten with validated + coerced values
      }

      // All validations passed → move to next middleware/controller
      next();

    } catch (error) {
      if (error instanceof z.ZodError) {
        // Build a human-readable error string from all validation failures
        // error.issues is an array — one entry per failing field
        const message = error.issues
          .map((e: z.ZodIssue) => (e.path.length ? `${e.path.join(".")}: ${e.message}` : e.message))
          .join(", ");
        //
        // Example: { email: "not-an-email", password: "" }
        // issues → [
        //   { path: ["email"],    message: "Invalid email" },
        //   { path: ["password"], message: "String must contain at least 1 character(s)" }
        // ]
        // message → "email: Invalid email, password: String must contain at least 1 character(s)"

        return res.status(400).json({ message });
      }

      // Not a validation error — something unexpected crashed
      // Pass to global error handler in app.ts
      next(error);
    }
  };
}
```

---

## `res.locals` — what it is and why query goes there

### What `res.locals` is

`res.locals` is Express's built-in **per-request shared storage**. It starts as `{}` on every request and lives only for that request's lifetime.

```
Request arrives   → res.locals = {}
requireAuth runs  → res.locals.user = decoded token
validate runs     → res.locals.query = { page: 2, limit: 10 }
controller runs   → can read both res.locals.user and res.locals.query
Response sent     → res.locals discarded
```

Any middleware can write to it, any subsequent middleware can read from it.

### Why query goes to `res.locals` instead of back to `req.query`

Express types `req.query` as `ParsedQs` — a type where all values must be strings or string arrays. Zod often **coerces** query values (e.g. `"2"` → `2`), so the result is no longer a pure string type. TypeScript rejects writing it back:

```ts
req.query = schemas.query.parse(req.query); // ❌ TypeScript error
// Type 'number' is not assignable to type 'string | ParsedQs | string[] | ParsedQs[]'
```

`res.locals` is typed as `Record<string, any>` — it accepts anything:

```ts
res.locals.query = schemas.query.parse(req.query); // ✅ no TypeScript error
```

### Reading in the controller

```ts
async function getCurriculums(req: Request, res: Response) {
  // Read coerced, validated values from res.locals
  const { page, limit, search } = res.locals.query;
  // page  → number (was "2" in URL, now 2)
  // limit → number (was "10" in URL, now 10)

  // NOT from req.query — those are still raw strings
  // req.query.page → "2" (string)
}
```

---

## How the error message is built

```ts
error.issues.map((e) => (e.path.length ? `${e.path.join(".")}: ${e.message}` : e.message))
```

`e.path` is an array of keys showing where in the object the error occurred:

```ts
// Top-level field
{ path: ["email"], message: "Invalid email" }
// → "email: Invalid email"

// Nested field
{ path: ["address", "city"], message: "Required" }
// → "address.city: Required"

// Top-level error (no path)
{ path: [], message: "Expected object, received string" }
// → "Expected object, received string"
```

All issues joined:
```
"email: Invalid email, password: String must contain at least 1 character(s)"
```

---

## Where `validate` is used in this project

```ts
// Auth routes
router.post("/auth/login",    authLimiter, validate({ body: loginBody }),    loginController);
router.post("/auth/register", authLimiter, validate({ body: registerBody }), registerController);

// Curriculum routes
router.get("/curriculums",     requireAuth, validate({ query: paginationQuery }),          getCurriculumsController);
router.get("/curriculums/:id", requireAuth, validate({ params: idParam }),                 getCurriculumController);
router.post("/curriculums",    requireAuth, validate({ body: createCurriculumBody }),       createCurriculumController);
router.put("/curriculums/:id", requireAuth, validate({ params: idParam, body: updateBody }), updateCurriculumController);
```

---

## The full request flow

```
POST /api/v1/auth/login
Body: { "email": "x", "password": "" }

──────────────────────────────────────────────────────
Step 1 — authLimiter
  checks rate limit → ok → next()

Step 2 — validate({ body: loginBody })
  req.body = { email: "x", password: "" }

  loginBody schema:
    email: z.string().email()    → "x" fails → issue: { path: ["email"], message: "Invalid email" }
    password: z.string().min(1)  → "" fails  → issue: { path: ["password"], message: "..." }

  ZodError caught:
    message = "email: Invalid email, password: String must contain at least 1 character(s)"

  Returns: HTTP 400 { "message": "email: Invalid email, ..." }
  next() is NEVER called → loginController never runs
──────────────────────────────────────────────────────

POST /api/v1/auth/login
Body: { "email": "alice@test.com", "password": "secret" }

Step 1 — authLimiter → ok → next()

Step 2 — validate({ body: loginBody })
  both fields pass Zod schema
  req.body = { email: "alice@test.com", password: "secret" }
  next()

Step 3 — loginController
  req.body.email    guaranteed valid ✓
  req.body.password guaranteed non-empty ✓
  → runs auth logic
```

---

## Step-by-step practice tasks

**Task 1 — Build your own validate middleware from scratch**

```ts
import { z } from "zod";

function myValidate(schema: z.ZodType) {
  return (req: any, res: any, next: any) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return res.status(400).json({ message });
    }
    req.body = result.data;
    next();
  };
}

// Test it
const productSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
});

app.post("/products", myValidate(productSchema), (req, res) => {
  res.json({ received: req.body });
});
```

**Task 2 — Observe all validation errors in one response**

```ts
const strictSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  age: z.number().int().min(13).max(120),
  role: z.enum(["admin", "student", "teacher"]),
});

// Send: { username: "ab", email: "bad", age: 5, role: "hacker" }
// Response should list all 4 errors at once
```

**Task 3 — Validate query strings with coercion**

```ts
const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().max(50).default(10),
});

// Simulate what Express sends (all strings):
const raw = { page: "3", limit: "25" };
const parsed = querySchema.parse(raw);
console.log(parsed); // { page: 3, limit: 25 } ← numbers, not strings
console.log(typeof parsed.page); // "number"
```

---

## Key takeaways

- `validate` is a factory — it takes a schema and returns a middleware function
- It protects all three parts of a request: `body`, `query`, `params`
- `req.body` and `req.params` are overwritten with coerced/validated values
- `req.query` cannot be overwritten due to TypeScript typing — use `res.locals.query` instead
- `ZodError.issues` is an array — one entry per failing field, all reported in one response
- If something other than a ZodError is thrown, it is forwarded to the global error handler
