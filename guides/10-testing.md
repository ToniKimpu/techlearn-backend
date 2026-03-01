# 10 — Testing (Vitest + Supertest)

## Goal

Write unit and integration tests: test JWT utilities, middlewares, auth endpoints, and CRUD operations.

---

## 10.1 Install Dependencies

```bash
npm install -D vitest supertest @types/supertest
```

| Package | Purpose |
|---------|---------|
| `vitest` | Test runner (fast, ESM-native, Jest-compatible API) |
| `supertest` | HTTP testing — makes requests to your Express app without starting a server |

---

## 10.2 Configure Vitest

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,         // Use describe/it/expect without imports
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    testTimeout: 10000,    // 10 seconds per test
  },
});
```

Add to `tsconfig.json` types:

```json
{
  "compilerOptions": {
    "types": ["node", "vitest/globals"]
  }
}
```

---

## 10.3 Mocking Strategy

Tests should NOT connect to real databases or Redis. Mock everything external:

```typescript
// Mock Prisma — every test file that uses DB
vi.mock("../../database/prisma.js", () => ({
  prisma: {
    authUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    curriculum: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    // ... other models
  },
}));

// Mock Redis — disable caching in tests
vi.mock("../../config/redis.js", () => ({
  redis: null,
  redisConnectionOptions: {},
}));

// Mock Passport
vi.mock("../../config/passport.js", () => ({
  default: {
    initialize: () => (_req: any, _res: any, next: any) => next(),
    authenticate: () => (_req: any, _res: any, next: any) => next(),
  },
}));
```

**Why mock?** Tests must be:
- **Fast** — No network calls
- **Isolated** — One test doesn't affect another
- **Deterministic** — Same result every time
- **Independent** — No external services required

---

## 10.4 Test JWT Utilities

Create `src/__tests__/jwt.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Set env before importing modules
vi.stubEnv("JWT_SECRET", "test-secret-at-least-32-characters-long");

// Mock dependencies
vi.mock("../config/redis.js", () => ({ redis: null }));
vi.mock("../database/prisma.js", () => ({ prisma: {} }));

const { generateAccessToken, verifyAccessToken } = await import("../utils/jwt.js");

describe("JWT Utils", () => {
  const tokenParams = {
    authId: "user-123",
    profileId: "profile-456",
    userType: "student",
  };

  it("should generate a valid JWT token", () => {
    const token = generateAccessToken(tokenParams);

    // JWT has 3 parts separated by dots
    expect(token.split(".")).toHaveLength(3);
  });

  it("should verify and decode a token", () => {
    const token = generateAccessToken(tokenParams);
    const payload = verifyAccessToken(token);

    expect(payload.authId).toBe("user-123");
    expect(payload.profileId).toBe("profile-456");
    expect(payload.userType).toBe("student");
  });

  it("should throw on invalid token", () => {
    expect(() => verifyAccessToken("invalid.token.here")).toThrow();
  });

  it("should throw when secret differs", () => {
    const token = generateAccessToken(tokenParams);

    // Tamper with the token
    const parts = token.split(".");
    parts[2] = "tampered-signature";
    const tampered = parts.join(".");

    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});
```

---

## 10.5 Test Middleware

Create `src/__tests__/requireAuth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

vi.stubEnv("JWT_SECRET", "test-secret-at-least-32-characters-long");
vi.mock("../config/redis.js", () => ({ redis: null }));
vi.mock("../database/prisma.js", () => ({ prisma: {} }));

const { requireAuth } = await import("../middlewares/requireAuth.js");
const { generateAccessToken } = await import("../utils/jwt.js");

// Helper: create mock Express objects
function createMocks() {
  const req = {
    headers: {},
  } as Partial<Request>;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as Partial<Response>;

  const next = vi.fn() as NextFunction;

  return { req: req as Request, res: res as Response, next };
}

describe("requireAuth middleware", () => {
  it("should call next() with valid Bearer token", () => {
    const { req, res, next } = createMocks();
    const token = generateAccessToken({
      authId: "user-123",
      profileId: "profile-456",
      userType: "student",
    });

    req.headers.authorization = `Bearer ${token}`;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authUser).toEqual({
      authId: "user-123",
      profileId: "profile-456",
      userType: "student",
    });
  });

  it("should return 401 without Authorization header", () => {
    const { req, res, next } = createMocks();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 with invalid token", () => {
    const { req, res, next } = createMocks();
    req.headers.authorization = "Bearer invalid-token";

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("should return 401 without Bearer prefix", () => {
    const { req, res, next } = createMocks();
    req.headers.authorization = "Basic some-token";

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

---

## 10.6 Test Auth Endpoints (Integration)

Create `src/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock all external dependencies
vi.stubEnv("JWT_SECRET", "test-secret-at-least-32-characters-long");
vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");

vi.mock("../database/prisma.js", () => ({
  prisma: {
    authUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../config/redis.js", () => ({
  redis: null,
  redisConnectionOptions: {},
}));

vi.mock("../config/passport.js", () => ({
  default: {
    initialize: () => (_req: any, _res: any, next: any) => next(),
    authenticate: () => (_req: any, _res: any, next: any) => next(),
  },
}));

vi.mock("../modules/email/producer.js", () => ({
  queueWelcomeEmail: vi.fn(),
}));

// Import AFTER mocks are set up
const { app } = await import("../app.js");
const { prisma } = await import("../database/prisma.js");

describe("POST /api/v1/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register a new user", async () => {
    // Mock: email doesn't exist yet
    vi.mocked(prisma.authUser.findUnique).mockResolvedValue(null);

    // Mock: create returns user with profile
    vi.mocked(prisma.authUser.create).mockResolvedValue({
      id: "auth-123",
      email: "test@test.com",
      profile: { id: "profile-456", fullName: "Test User", userType: "student" },
    } as any);

    vi.mocked(prisma.authUser.update).mockResolvedValue({} as any);
    vi.mocked(prisma.session.create).mockResolvedValue({ id: "session-789" } as any);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "test@test.com", password: "password123", name: "Test User" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
    expect(res.body.user).toEqual({
      authId: "auth-123",
      profileId: "profile-456",
      userType: "student",
    });
  });

  it("should reject duplicate email", async () => {
    vi.mocked(prisma.authUser.findUnique).mockResolvedValue({ id: "existing" } as any);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "test@test.com", password: "password123", name: "Test User" });

    expect(res.status).toBe(409);
  });

  it("should validate email format", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: "password123", name: "Test User" });

    expect(res.status).toBe(400);
  });

  it("should require password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "test@test.com", name: "Test User" });

    expect(res.status).toBe(400);
  });
});
```

---

## 10.7 Test CRUD Endpoints

Create `src/__tests__/curriculums.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ... same env stubs and mocks as auth.test.ts ...

const { app } = await import("../app.js");
const { prisma } = await import("../database/prisma.js");
const { generateAccessToken } = await import("../utils/jwt.js");

// Helper: generate admin token
function adminToken() {
  return generateAccessToken({
    authId: "admin-id",
    profileId: "admin-profile",
    userType: "admin",
  });
}

function studentToken() {
  return generateAccessToken({
    authId: "student-id",
    profileId: "student-profile",
    userType: "student",
  });
}

describe("Curriculums", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v1/curriculums", () => {
    it("should return paginated list", async () => {
      vi.mocked(prisma.curriculum.findMany).mockResolvedValue([
        { id: 1n, name: "Test Curriculum", isDeleted: false },
      ] as any);
      vi.mocked(prisma.curriculum.count).mockResolvedValue(1);

      const res = await request(app)
        .get("/api/v1/curriculums")
        .set("Authorization", `Bearer ${studentToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it("should require authentication", async () => {
      const res = await request(app).get("/api/v1/curriculums");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/curriculums", () => {
    it("should create curriculum (admin)", async () => {
      vi.mocked(prisma.curriculum.create).mockResolvedValue({
        id: 1n,
        name: "New Curriculum",
      } as any);

      const res = await request(app)
        .post("/api/v1/curriculums")
        .set("Authorization", `Bearer ${adminToken()}`)
        .send({ name: "New Curriculum" });

      expect(res.status).toBe(201);
    });

    it("should reject non-admin", async () => {
      const res = await request(app)
        .post("/api/v1/curriculums")
        .set("Authorization", `Bearer ${studentToken()}`)
        .send({ name: "New Curriculum" });

      expect(res.status).toBe(403);
    });

    it("should validate name is required", async () => {
      const res = await request(app)
        .post("/api/v1/curriculums")
        .set("Authorization", `Bearer ${adminToken()}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
```

---

## 10.8 Test Patterns Summary

```
Pattern 1: Unit test (test a function in isolation)
  → JWT, session, email templates

Pattern 2: Middleware test (test Express middleware)
  → Create mock req/res/next objects
  → Call middleware(req, res, next)
  → Assert: next() called? res.status()? req.authUser set?

Pattern 3: Integration test (test full HTTP request → response)
  → Use supertest with your Express app
  → Mock external dependencies (DB, Redis, email)
  → Assert: status code, response body, side effects
```

---

## 10.9 Other Tests to Write

Following the same patterns, create tests for:

- `requirePermission.test.ts` — Test RBAC (admin passes, student fails)
- `requireRole.test.ts` — Test role-based middleware
- `validate.test.ts` — Test Zod validation middleware
- `session.test.ts` — Test generateRefreshToken(), getSessionExpiry()
- `email.test.ts` — Test email template generation and queue functions

---

## 10.10 Run Tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Run specific test file
npx vitest run src/__tests__/jwt.test.ts
```

Expected output:
```
 ✓ src/__tests__/jwt.test.ts (4 tests)
 ✓ src/__tests__/requireAuth.test.ts (4 tests)
 ✓ src/__tests__/auth.test.ts (4 tests)
 ✓ src/__tests__/curriculums.test.ts (5 tests)
 ...

 Test Files  9 passed
 Tests       52 passed
```

---

## Checkpoint

- [x] Vitest configured with globals
- [x] Mocking strategy for Prisma, Redis, Passport
- [x] JWT utility tests
- [x] Middleware tests (requireAuth, requirePermission, requireRole, validate)
- [x] Auth endpoint integration tests
- [x] CRUD endpoint integration tests
- [x] Session utility tests
- [x] Email template/queue tests
- [x] All 52 tests passing

**Commit:** `git commit -m "add Vitest tests for JWT, middlewares, auth, and CRUD endpoints"`

---

## Key Concepts to Understand

1. **Test pyramid** — Unit tests (many, fast) → Integration tests (some, slower) → E2E tests (few, slowest)
2. **Mocking** — Replace real dependencies with controlled fakes: https://vitest.dev/guide/mocking
3. **Supertest** — HTTP testing without starting a server: https://github.com/ladjs/supertest
4. **Test isolation** — Each test should be independent. `beforeEach(() => vi.clearAllMocks())` ensures no state leaks.
5. **AAA pattern** — Arrange (setup mocks), Act (call the function), Assert (check results)
