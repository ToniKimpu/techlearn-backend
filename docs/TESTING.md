# Testing Guide

## Setup

Tests use **Vitest** + **Supertest**. No test database needed — Prisma is mocked.

## Run Tests

```bash
# Run all tests once
npm test

# Run in watch mode (re-runs on file change)
npm run test:watch

# Run a specific test file
npx vitest run src/__tests__/auth.test.ts

# Run tests matching a name
npx vitest run -t "returns 403"
```

## Test Files

```
src/__tests__/
├── jwt.test.ts            # JWT token generation & verification
├── session.test.ts        # Session utility functions
├── requireAuth.test.ts    # Auth middleware (401 checks)
├── requireRole.test.ts    # RBAC middleware (403 checks)
├── validate.test.ts       # Zod validation middleware
├── curriculums.test.ts    # Curriculums API (integration)
└── auth.test.ts           # Auth API (integration)
```

## Test Types

### Unit Tests
Test a single function or middleware in isolation with mocked req/res.

**Files:** `jwt`, `session`, `requireAuth`, `requireRole`, `validate`

```ts
// Example: testing middleware
const { req, res } = createMockReqRes("student");
requireRole("admin")(req, res, next);
expect(resBody.statusCode).toBe(403);
```

### Integration Tests
Test full HTTP request → response using Supertest with mocked database.

**Files:** `curriculums`, `auth`

```ts
// Example: testing an endpoint
const res = await request(app)
  .post("/api/v1/curriculums")
  .set("Authorization", `Bearer ${token}`)
  .send({ name: "Test" });

expect(res.status).toBe(201);
```

## What's Tested

### Auth API
| Test | Expected |
|------|----------|
| Register with missing fields | 400 |
| Register with invalid email | 400 |
| Register with short password | 400 |
| Register with existing email | 400 |
| Register with valid data | 201 + tokens |
| Logout without refresh token | 400 |
| Logout with valid token | 200 |

### Curriculums API (RBAC)
| Test | Expected |
|------|----------|
| GET without auth token | 401 |
| GET as student | 200 (read allowed) |
| GET as admin | 200 |
| POST as student | 403 (forbidden) |
| POST as teacher | 403 (forbidden) |
| POST as admin | 201 (allowed) |
| POST with missing name | 400 |
| PUT as student | 403 |
| PUT as admin | 200 |
| DELETE as student | 403 |
| DELETE as admin | 200 |
| DELETE non-existent id | 404 |

### Middleware
| Test | Expected |
|------|----------|
| requireAuth — valid token | next() called |
| requireAuth — no header | 401 |
| requireAuth — invalid token | 401 |
| requireRole — matching role | next() called |
| requireRole — wrong role | 403 |
| validate — valid body | next() called |
| validate — invalid body | 400 + error message |
| validate — query defaults | page=1, limit=10 |

## Writing New Tests

### 1. Unit test for a middleware

```ts
import { describe, it, expect } from "vitest";

describe("myMiddleware", () => {
  it("does something", () => {
    const req = { /* mock */ } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    myMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
```

### 2. Integration test for a new route

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

// Mock Prisma
vi.mock("../database/prisma.js", () => ({
  prisma: {
    yourModel: {
      findMany: vi.fn(),
      create: vi.fn(),
      // add methods you need
    },
  },
}));

// Mock Passport
vi.mock("../config/passport.js", () => {
  const passport = {
    initialize: () => (_req: any, _res: any, next: any) => next(),
    use: vi.fn(),
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
    authenticate: vi.fn(),
  };
  return { default: passport };
});

import request from "supertest";
import app from "../app.js";
import { generateAccessToken } from "../utils/jwt.js";

function getToken(userType: string) {
  return generateAccessToken({ authId: "a1", profileId: "p1", userType });
}

describe("Your API", () => {
  it("works", async () => {
    const res = await request(app)
      .get("/api/v1/your-endpoint")
      .set("Authorization", `Bearer ${getToken("admin")}`);

    expect(res.status).toBe(200);
  });
});
```

## Key Notes

- **No real database** — Prisma is mocked with `vi.mock()`, so tests run fast
- **Real JWT tokens** — Tests generate actual tokens using `generateAccessToken()`
- **Env vars** — Set in `beforeAll()` before app imports, no `.env.test` needed
- **RBAC testing** — Change `userType` in `getToken()` to test different roles
