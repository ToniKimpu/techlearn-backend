# 17 — Vitest + Supertest (Testing)

## Why write tests?

Tests are code that automatically verifies that other code works correctly. Without tests:

```
Developer changes auth logic
  → forgets to test the refresh token scenario
  → deploys
  → 2am: all users logged out
  → rollback
```

With tests:
```
Developer changes auth logic
  → runs: npm test
  → "refresh token test: FAILED"
  → fixes the bug before deploying
```

Tests give you confidence to change code without fear of breaking things.

---

## Vitest vs Jest

Vitest is a modern test runner built for ES modules. It's faster than Jest and has the same API — if you know Jest, you already know Vitest.

Key Vitest functions:

```ts
describe("group", () => {   // group related tests
  it("does something", () => { // individual test
    expect(2 + 2).toBe(4);   // assertion
  });

  beforeEach(() => { ... }); // runs before each test
  afterEach(() => { ... });  // runs after each test
  beforeAll(() => { ... });  // runs once before all tests in this group
  afterAll(() => { ... });   // runs once after all tests in this group
});
```

---

## Supertest

Supertest lets you fire HTTP requests against your Express app **in-process** — no running server needed.

```ts
import request from "supertest";
import app from "../app.js";

// Makes a real HTTP request to your Express app
const response = await request(app)
  .post("/api/v1/auth/login")
  .set("Content-Type", "application/json")
  .send({ email: "test@example.com", password: "password" });

expect(response.status).toBe(200);
expect(response.body).toHaveProperty("accessToken");
```

The app does not need to be listening on a port — Supertest handles this internally.

---

## Tests in this project

Tests are in `src/__tests__/`. Let's look at the JWT tests:

```ts
// src/__tests__/jwt.test.ts
import { describe, it, expect } from "vitest";
import { generateAccessToken, verifyAccessToken } from "../utils/jwt.js";

describe("JWT utilities", () => {
  it("generates a valid token", () => {
    const payload = {
      authId: "user-123",
      profileId: "profile-456",
      userType: "student",
    };

    const token = generateAccessToken(payload);

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // header.payload.signature
  });

  it("verifies a valid token and returns the payload", () => {
    const payload = {
      authId: "user-123",
      profileId: "profile-456",
      userType: "student",
    };

    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.authId).toBe(payload.authId);
    expect(decoded.profileId).toBe(payload.profileId);
    expect(decoded.userType).toBe(payload.userType);
  });

  it("throws on an invalid token", () => {
    expect(() => verifyAccessToken("invalid.token.here")).toThrow();
  });
});
```

---

## Types of tests

### Unit tests — test a single function in isolation

```ts
// Test the validation schema, not the whole route
import { loginBody } from "../modules/auth/schemas.js";

describe("loginBody schema", () => {
  it("accepts valid credentials", () => {
    const result = loginBody.safeParse({
      email: "user@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginBody.safeParse({
      email: "not-an-email",
      password: "secret123",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path).toContain("email");
  });

  it("rejects empty password", () => {
    const result = loginBody.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});
```

### Integration tests — test a full HTTP request/response cycle

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../database/prisma.js";

describe("POST /api/v1/auth/login", () => {
  beforeAll(async () => {
    // Seed test user in the DB
    const hash = await argon2.hash("testpassword");
    await prisma.authUser.create({
      data: { email: "test@example.com", passwordHash: hash },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.authUser.delete({ where: { email: "test@example.com" } });
    await prisma.$disconnect();
  });

  it("returns 200 with tokens for valid credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com", password: "testpassword" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
  });

  it("returns 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com", password: "wrong" });

    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@example.com" }); // missing password

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("password");
  });
});
```

### Testing protected routes

```ts
it("returns 401 when not authenticated", async () => {
  const res = await request(app).get("/api/v1/curriculums");
  expect(res.status).toBe(401);
});

it("returns 200 when authenticated", async () => {
  // First login to get a token
  const loginRes = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "test@example.com", password: "testpassword" });

  const { accessToken } = loginRes.body;

  // Use the token in subsequent requests
  const res = await request(app)
    .get("/api/v1/curriculums")
    .set("Authorization", `Bearer ${accessToken}`);

  expect(res.status).toBe(200);
});
```

---

## Vitest configuration

This project uses Vitest. Check `package.json` for the test script:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Run tests:
```bash
npm test              # run all tests once
npm run test:watch    # watch mode — re-runs on file change
```

---

## Step-by-step practice

**Task 1 — Write unit tests for the JWT utility**

Create `src/__tests__/jwt.practice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateAccessToken, verifyAccessToken } from "../utils/jwt.js";

const samplePayload = {
  authId: "test-user-1",
  profileId: "profile-1",
  userType: "student",
};

describe("generateAccessToken", () => {
  it("returns a string with three dot-separated parts", () => {
    const token = generateAccessToken(samplePayload);
    expect(token.split(".")).toHaveLength(3);
  });
});

describe("verifyAccessToken", () => {
  it("returns the correct payload", () => {
    const token = generateAccessToken(samplePayload);
    const decoded = verifyAccessToken(token);
    expect(decoded.authId).toBe(samplePayload.authId);
  });

  it("throws on a tampered token", () => {
    const token = generateAccessToken(samplePayload);
    const [h, p, s] = token.split(".");
    expect(() => verifyAccessToken(`${h}.tampered${p}.${s}`)).toThrow();
  });

  it("throws on a completely invalid token", () => {
    expect(() => verifyAccessToken("not.a.token")).toThrow();
  });
});
```

**Task 2 — Write a test for Zod schema validation**

```ts
import { describe, it, expect } from "vitest";
import { registerBody } from "../modules/auth/schemas.js";

describe("registerBody schema", () => {
  it("accepts valid data", () => {
    const result = registerBody.safeParse({
      email: "alice@example.com",
      password: "secure123",
      name: "Alice",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = registerBody.safeParse({
      email: "not-email",
      password: "secure123",
      name: "Alice",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = registerBody.safeParse({
      email: "alice@example.com",
      password: "abc",  // less than 6 chars
      name: "Alice",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = registerBody.safeParse({
      email: "alice@example.com",
      password: "secure123",
      name: "   ",  // whitespace only — trim() then min(1) fails
    });
    expect(result.success).toBe(false);
  });
});
```

**Task 3 — Test an HTTP route with Supertest**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status");
    expect(["ok", "degraded"]).toContain(res.body.status);
    expect(typeof res.body.uptime).toBe("number");
  });
});
```

---

## Key takeaways

- Vitest is the test runner — `describe` groups tests, `it` defines tests, `expect` makes assertions
- Supertest sends HTTP requests to your Express app without a running server
- Unit tests verify a single function; integration tests verify the full request/response flow
- `beforeAll`/`afterAll` handle setup and cleanup (seeding test data, disconnecting DB)
- Always test: valid input (happy path), invalid input (validation errors), missing auth (401)
- Run `npm test` to execute all tests; `npm run test:watch` to rerun on file change
