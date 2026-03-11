# 03 — Zod

## What is Zod?

Zod is a **schema validation library**. You describe the shape and rules of your data in code, then ask Zod to verify that incoming data matches that shape.

The key insight: in a web server, you cannot trust anything that comes from outside — request bodies, query strings, URL params. They are all strings until you validate them. Zod is the guard at the door.

```
Client sends JSON  →  Zod checks it  →  Valid: passes to handler
                                         Invalid: returns 400 error
```

---

## How this project uses Zod

**Schema definitions** live in each module's `schemas.ts` file.

```ts
// src/modules/auth/schemas.ts
import { z } from "zod";

export const registerBody = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().trim().min(1, "Name is required"),
});

export const loginBody = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
```

**The `validate` middleware** applies a schema to the request before the handler runs:

```ts
// src/middlewares/validate.ts
export function validate(schemas: ValidateSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body); // throws if invalid
      }
      if (schemas.query) {
        res.locals.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next(); // only called if everything is valid
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return res.status(400).json({ message });
      }
      next(error);
    }
  };
}
```

**Used in routes** like a plug-and-play guard:

```ts
// In a route file
router.post(
  "/auth/login",
  authLimiter,
  validate({ body: loginBody }), // ← Zod guard
  loginController               // ← only runs if body is valid
);
```

---

## How Zod works — step by step

### Defining a schema

```ts
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().min(0).max(120),
  role: z.enum(["admin", "student", "teacher"]),
});
```

### Parsing (throws on failure)

```ts
// Valid data
const user = userSchema.parse({
  name: "Alice",
  email: "alice@example.com",
  age: 25,
  role: "student",
});
// Returns: { name: "Alice", email: "alice@example.com", age: 25, role: "student" }

// Invalid data — throws ZodError
userSchema.parse({
  name: "",       // too short
  email: "not-an-email",
  age: -5,        // below minimum
  role: "hacker", // not in enum
});
```

### Safe parsing (returns result object, never throws)

```ts
const result = userSchema.safeParse(unknownData);

if (result.success) {
  console.log(result.data); // typed correctly
} else {
  console.log(result.error.issues); // array of validation errors
}
```

### Extracting the TypeScript type

This is Zod's superpower — one schema, two uses:

```ts
const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

// Extract the TypeScript type — no duplication
type User = z.infer<typeof userSchema>;
// Equivalent to: { name: string; email: string }

function createUser(data: User) { ... } // fully typed
```

---

## Common Zod validators

```ts
// Strings
z.string()                     // any string
z.string().min(3)              // at least 3 chars
z.string().max(100)            // at most 100 chars
z.string().email()             // valid email format
z.string().url()               // valid URL
z.string().uuid()              // valid UUID
z.string().trim()              // trim whitespace before validation

// Numbers
z.number()                     // any number
z.number().int()               // must be integer
z.number().min(0).max(100)     // range check
z.number().positive()          // must be > 0

// Other types
z.boolean()
z.date()
z.enum(["a", "b", "c"])       // one of these values
z.array(z.string())            // array of strings
z.optional(z.string())         // string or undefined
z.nullable(z.string())         // string or null

// Objects
z.object({
  name: z.string(),
  meta: z.object({             // nested object
    tags: z.array(z.string()),
  }),
})

// Transforms — parse and transform in one step
z.string().transform((val) => val.toLowerCase())
z.string().pipe(z.coerce.number()) // string → number
```

---

## Step-by-step practice

**Task 1 — Validate a registration form**

```ts
import { z } from "zod";

const registerSchema = z.object({
  username: z.string().trim().min(3, "Username too short").max(20, "Username too long"),
  email: z.string().email("Must be a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  age: z.number().int().min(13, "Must be at least 13"),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "Passwords do not match", path: ["confirmPassword"] }
);

// Test: valid
console.log(registerSchema.safeParse({
  username: "alice",
  email: "alice@example.com",
  password: "secret123",
  confirmPassword: "secret123",
  age: 20,
}));

// Test: invalid
console.log(registerSchema.safeParse({
  username: "al",             // too short
  email: "not-an-email",
  password: "abc",            // too short
  confirmPassword: "xyz",     // doesn't match
  age: 10,                    // below 13
}));
```

**Task 2 — Query string validation**

```ts
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

// Simulate query string (everything is a string from HTTP)
const raw = { page: "2", limit: "10", search: "algebra" };
const result = paginationSchema.parse(raw);
console.log(result);
// { page: 2, limit: 10, search: "algebra" }
// ↑ page and limit are now numbers, not strings
```

**Task 3 — Understand the error format**

```ts
const schema = z.object({
  user: z.object({
    email: z.string().email(),
    age: z.number().min(0),
  }),
});

const result = schema.safeParse({
  user: {
    email: "bad",
    age: -1,
  },
});

if (!result.success) {
  result.error.issues.forEach((issue) => {
    console.log(`Path: ${issue.path.join(".")}, Message: ${issue.message}`);
  });
  // Path: user.email, Message: Invalid email
  // Path: user.age, Message: Number must be greater than or equal to 0
}
```

---

## Key takeaways

- Zod validates data at runtime and generates TypeScript types at compile time
- `.parse()` throws a `ZodError` on failure; `.safeParse()` returns a result object
- `z.infer<typeof schema>` extracts the TypeScript type — no need to define it twice
- The `validate` middleware in this project wraps Zod and returns 400 with error details
- Always validate `req.body`, `req.query`, and `req.params` — never trust them raw
