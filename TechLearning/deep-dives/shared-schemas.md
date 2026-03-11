# Deep Dive — Shared Zod Schemas

> File: `src/schemas/shared.ts`

---

## Why shared schemas exist

These three schemas are used across almost every module in the backend:

```
bigIntId        → validates any :id URL parameter
idParam         → wraps bigIntId in an object for use with validate({ params })
paginationQuery → validates ?page=&limit=&search= on every list endpoint
```

Instead of copying the same Zod code into every module, they live here once and are imported wherever needed:

```ts
import { idParam, paginationQuery } from "../../schemas/shared.js";

router.get("/curriculums",     validate({ query: paginationQuery }), listController);
router.get("/curriculums/:id", validate({ params: idParam }),        getOneController);
router.put("/curriculums/:id", validate({ params: idParam, body: updateBody }), updateController);
```

---

## Full source code with annotations

```ts
import { z } from "zod";

// ── bigIntId ──────────────────────────────────────────────────────────────────
// Validates a single ID value that maps to a PostgreSQL BigInt column.
// Accepts either a string "42" or a number 42 → always outputs a string.
export const bigIntId = z
  .union([z.string(), z.number()])   // accept string OR number as input
  .transform((val) => String(val))   // normalize: always convert to string
  .refine((val) => {                 // custom validation rule
    try {
      return BigInt(val) >= 1n;      // must be a valid integer ≥ 1
    } catch {
      return false;                  // BigInt("abc") throws → invalid
    }
  }, "Must be a valid positive integer");

// ── idParam ───────────────────────────────────────────────────────────────────
// Object schema for use with validate({ params: idParam })
// Matches the :id segment in route paths like /curriculums/:id
export const idParam = z.object({
  id: bigIntId,
});

// ── paginationQuery ───────────────────────────────────────────────────────────
// Object schema for use with validate({ query: paginationQuery })
// Validates and coerces ?page=2&limit=10&search=algebra
export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
});
```

---

## Deep dive: `bigIntId`

### Why BigInt?

PostgreSQL has two integer column types commonly used for IDs:

```
INTEGER   → up to 2,147,483,647 (2 billion)
BIGINT    → up to 9,223,372,036,854,775,807 (9 quintillion)
```

JavaScript's `number` type can only safely represent integers up to `2^53 - 1` = `9,007,199,254,740,991`. Beyond that, numbers lose precision:

```ts
console.log(9007199254740993);        // 9007199254740992 ← WRONG!
console.log(9007199254740993n);       // 9007199254740993n ← correct
```

For BigInt IDs in a large system, JavaScript's `number` would silently corrupt the values. `BigInt` handles arbitrary precision.

---

### Step 1 — `.union([z.string(), z.number()])`

Accept either type as input. This is necessary because the same ID arrives in different forms depending on where it comes from:

```ts
// URL parameters — always strings (Express never converts them)
// GET /curriculums/42  →  req.params = { id: "42" }

// JSON body — JavaScript number (after JSON.parse)
// { "curriculumId": 42 }  →  req.body.curriculumId = 42

// z.union tries each schema in order and uses the first that succeeds
z.union([z.string(), z.number()]).parse("42") // → "42" (matches z.string())
z.union([z.string(), z.number()]).parse(42)   // → 42   (matches z.number())
z.union([z.string(), z.number()]).parse(true) // throws — neither matches
```

---

### Step 2 — `.transform((val) => String(val))`

Converts the value to a string so the next step always works consistently:

```ts
String("42") // → "42"   (already a string, no change)
String(42)   // → "42"   (number converted to string)
String(0)    // → "0"    (zero → "0")
String(-5)   // → "-5"   (negative → "-5")
```

After `.transform()`, the Zod type changes from `string | number` to `string`. The `.refine()` step that follows always receives a string.

---

### Step 3 — `.refine((val) => { ... }, "error message")`

`.refine()` lets you write **custom validation logic** that Zod's built-in validators cannot express. It receives the transformed value and must return `true` (valid) or `false` (invalid).

```ts
.refine((val) => {
  try {
    return BigInt(val) >= 1n;
  } catch {
    return false;
  }
}, "Must be a valid positive integer")
```

What `BigInt(val)` does to various inputs:

```ts
BigInt("42")   → 42n  → 42n >= 1n  → true  ✓
BigInt("1")    → 1n   → 1n >= 1n   → true  ✓
BigInt("0")    → 0n   → 0n >= 1n   → false ✗  (zero is not a valid ID)
BigInt("-5")   → -5n  → -5n >= 1n  → false ✗  (negative IDs don't exist)
BigInt("abc")  → throws SyntaxError → catch → false ✗
BigInt("3.14") → throws SyntaxError → catch → false ✗
BigInt("")     → throws SyntaxError → catch → false ✗
BigInt("9999999999999999999999") → huge bigint → still ✓ (valid large ID)
```

The `try/catch` is essential. Unlike `Number("abc")` which returns `NaN`, `BigInt("abc")` throws a `SyntaxError`. Without catching it, the entire middleware would crash.

### Why `1n` not just `1`?

The `n` suffix creates a **BigInt literal**. You cannot compare a BigInt with a regular number:

```ts
42n >= 1    // TypeError: Cannot mix BigInt and other types
42n >= 1n   // true ✓
```

---

### Full validation examples for `bigIntId`

```ts
bigIntId.parse("42")    // → "42"   ✓
bigIntId.parse(42)      // → "42"   ✓ (number coerced to string)
bigIntId.parse("1")     // → "1"    ✓
bigIntId.parse("0")     // throws — zero is not a valid ID
bigIntId.parse("-1")    // throws — negative is not a valid ID
bigIntId.parse("abc")   // throws — not a valid integer
bigIntId.parse("3.14")  // throws — not an integer
bigIntId.parse(true)    // throws — boolean not in union
bigIntId.parse(null)    // throws — null not in union
bigIntId.parse("9999999999999999999") // → "9999999999999999999" ✓
```

---

## Deep dive: `idParam`

```ts
export const idParam = z.object({
  id: bigIntId,
});
```

`req.params` is an object, not a plain value. The `validate` middleware calls `schemas.params.parse(req.params)`, so you need an **object schema** that has an `id` field.

Without `idParam`, you'd write this in every route file:
```ts
validate({ params: z.object({ id: bigIntId }) }) // repetitive
```

With `idParam`:
```ts
validate({ params: idParam }) // reusable
```

After validation, `req.params.id` is guaranteed to be a valid BigInt string like `"42"`. Your service can safely call:

```ts
await prisma.curriculum.findUnique({
  where: { id: BigInt(req.params.id) }
});
```

---

## Deep dive: `paginationQuery`

```ts
export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
});
```

### `z.coerce.number()` — the key piece

Query strings are **always strings** in Express:

```
URL: /curriculums?page=2&limit=10
req.query = { page: "2", limit: "10" }   // strings!
```

`z.coerce.number()` converts the string to a number before validating:

```ts
z.coerce.number().parse("2")   // → 2    (string → number)
z.coerce.number().parse("2.5") // → 2.5  (still a number)
z.coerce.number().parse("abc") // throws — cannot coerce
z.coerce.number().parse("")    // throws — empty string → NaN
```

This is different from `z.number()` which does NOT coerce:
```ts
z.number().parse("2")   // throws — "2" is a string, not a number
z.coerce.number().parse("2") // → 2 ✓
```

### Chain breakdown for `page`

```ts
z.coerce.number()  // "2" → 2
.int()             // 2.5 fails — must be integer
.positive()        // 0, -1 fail — must be > 0
.default(1)        // missing → 1
```

```
?page=2      → page: 2    ✓
?page=1      → page: 1    ✓
?page=2.5    → throws (not integer)
?page=0      → throws (not positive)
?page=-1     → throws (not positive)
?page=abc    → throws (not a number)
(no page)    → page: 1    ✓ (default)
```

### Chain breakdown for `limit`

```ts
z.coerce.number()  // "10" → 10
.int()             // must be integer
.positive()        // must be > 0
.max(100)          // must be ≤ 100 — prevents fetching millions of rows
.default(10)       // missing → 10
```

The `.max(100)` is a security constraint. Without it:
```
?limit=999999 → Prisma: SELECT * FROM curriculums LIMIT 999999
→ database scans the entire table → server hangs
```

### Chain breakdown for `search`

```ts
z.string()   // must be a string
.trim()      // "  math  " → "math" (remove whitespace)
.optional()  // field doesn't have to exist — undefined is valid
```

```
?search=algebra     → search: "algebra"    ✓
?search=  math      → search: "math"       ✓ (trimmed)
?search=            → search: ""           ✓ (empty string — your service can ignore it)
(no search param)   → search: undefined    ✓
```

### How it's used in a controller

```ts
async function getCurriculumsController(req: Request, res: Response) {
  // res.locals.query was set by validate({ query: paginationQuery })
  const { page, limit, search } = res.locals.query;
  //       number  number  string|undefined

  const skip = (page - 1) * limit;  // page 1 → skip 0, page 2 → skip 10

  const where = search
    ? { title: { contains: search, mode: "insensitive" as const } }
    : {};

  const [data, total] = await Promise.all([
    prisma.curriculum.findMany({ where, skip, take: limit }),
    prisma.curriculum.count({ where }),
  ]);

  res.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
```

---

## How all three work together in a route

```ts
// Update curriculum by ID
router.put(
  "/curriculums/:id",
  requireAuth,
  validate({ params: idParam, body: updateCurriculumBody }),
  updateCurriculumController
);
```

Request: `PUT /api/v1/curriculums/42` with body `{ "title": "New Title" }`

```
Step 1 — requireAuth:
  Verifies JWT → req.authUser = { authId: "...", ... }
  next()

Step 2 — validate({ params: idParam, body: updateCurriculumBody }):
  params:
    req.params = { id: "42" }
    idParam.parse({ id: "42" }) → passes bigIntId validation
    req.params = { id: "42" } (confirmed valid)

  body:
    req.body = { title: "New Title" }
    updateCurriculumBody.parse({ title: "New Title" }) → valid
    req.body = { title: "New Title" }

  next()

Step 3 — updateCurriculumController:
  req.params.id → "42"  (guaranteed valid BigInt string)
  req.body.title → "New Title" (guaranteed valid string)

  await prisma.curriculum.update({
    where: { id: BigInt(req.params.id) },  // BigInt("42") → 42n
    data: { title: req.body.title },
  });
```

---

## Step-by-step practice tasks

**Task 1 — Test bigIntId with all edge cases**

```ts
import { z } from "zod";

const bigIntId = z
  .union([z.string(), z.number()])
  .transform((val) => String(val))
  .refine((val) => {
    try { return BigInt(val) >= 1n; }
    catch { return false; }
  }, "Must be a valid positive integer");

const cases = [
  { input: "42",    expected: "pass" },
  { input: 42,      expected: "pass" },
  { input: "1",     expected: "pass" },
  { input: "0",     expected: "fail" },
  { input: "-1",    expected: "fail" },
  { input: "abc",   expected: "fail" },
  { input: "3.14",  expected: "fail" },
  { input: "",      expected: "fail" },
  { input: "9999999999999999999", expected: "pass" },
];

cases.forEach(({ input, expected }) => {
  const result = bigIntId.safeParse(input);
  const actual = result.success ? "pass" : "fail";
  const status = actual === expected ? "✓" : "✗ UNEXPECTED";
  console.log(`${status} input: ${JSON.stringify(input)} → ${actual}`);
});
```

**Task 2 — Test paginationQuery coercion**

```ts
const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
});

// Simulate raw query strings from Express
const cases = [
  { page: "2", limit: "20", search: "algebra" },
  { page: "1", limit: "100" },                 // max limit
  {},                                           // all defaults
  { page: "abc" },                             // invalid page
  { limit: "101" },                            // exceeds max
  { page: "0" },                               // not positive
  { search: "  math  " },                      // should be trimmed
];

cases.forEach((raw) => {
  const result = paginationQuery.safeParse(raw);
  if (result.success) {
    console.log("✓ Parsed:", result.data);
  } else {
    console.log("✗ Error:", result.error.issues.map((e) => e.message).join(", "));
  }
});
```

**Task 3 — Build a paginated list endpoint**

```ts
import express from "express";
import { z } from "zod";

const app = express();

const products = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  name: `Product ${i + 1}`,
  price: (i + 1) * 10,
}));

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(20).default(5),
  search: z.string().trim().optional(),
});

app.get("/products", (req, res) => {
  const result = paginationQuery.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ message: result.error.issues[0].message });
  }

  const { page, limit, search } = result.data;
  const filtered = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : products;

  const skip = (page - 1) * limit;
  const data = filtered.slice(skip, skip + limit);

  res.json({
    data,
    pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
  });
});

app.listen(3001);
```

Test:
```bash
curl "http://localhost:3001/products?page=2&limit=5"
curl "http://localhost:3001/products?search=Product+1"
curl "http://localhost:3001/products?page=abc"     # 400 error
curl "http://localhost:3001/products?limit=999"    # 400 error
curl "http://localhost:3001/products"              # page=1, limit=5 (defaults)
```

---

## Key takeaways

- `bigIntId` uses `.union()` to accept both `string` and `number`, then `.transform()` to normalize, then `.refine()` for custom BigInt validation
- `BigInt("abc")` throws (not returns NaN) — always wrap in `try/catch`
- `1n` is a BigInt literal — you cannot mix BigInt and regular number with `>=`
- `paginationQuery` uses `z.coerce.number()` because query string values are always strings in Express
- `.max(100)` on `limit` is a security measure — prevents clients from fetching entire tables
- `.default(1)` and `.default(10)` mean the URL works with or without those parameters
- Shared schemas avoid repetition — define once, import everywhere
