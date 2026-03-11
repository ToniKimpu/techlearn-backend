# Backend Tech Learning Roadmap

A structured guide to every technology used in `techlearn-backend` — ordered from fundamental to advanced.

---

## Tier 1 — Core Foundations

### 1. Node.js + TypeScript

**What it does**
Node.js is the JavaScript runtime that executes server-side code. TypeScript adds a static type system on top of JavaScript.

**Why it matters**
Every other technology in this project runs on top of these two. TypeScript catches entire categories of bugs at compile time before code ever runs.

**Practice task**
Build a CLI tool that reads a JSON file, filters items by a field, and prints results — model all shapes with TypeScript interfaces.

---

### 2. Express.js

**Files:** [`src/app.ts`](src/app.ts), [`src/server.ts`](src/server.ts)

**What it does**
Minimal HTTP framework for Node.js. Handles routing, middleware chaining, and error propagation.

**Why it matters**
Every API route, auth check, validation, and error handler in this project passes through Express. Understanding the request/response lifecycle is essential before anything else.

**Practice task**
Build a `/users` REST API with GET / POST / PUT / DELETE routes entirely from scratch — no ORM, no helpers. Just Express and an in-memory array.

---

### 3. Zod

**Files:** [`src/middlewares/validate.ts`](src/middlewares/validate.ts), [`src/modules/auth/schemas.ts`](src/modules/auth/schemas.ts)

**What it does**
Runtime schema validation library. You define the expected shape of data; Zod validates incoming requests against it and auto-generates TypeScript types.

**Why it matters**
Prevents malformed or malicious data from ever reaching your database. One schema serves dual purpose: runtime guard + compile-time types.

**Practice task**
Define a `createUserSchema` with Zod (name, email, age). Validate a mock request body. Intentionally send invalid data (wrong type, missing field) and inspect the error messages.

---

### 4. Prisma + PostgreSQL

**Files:** [`prisma/schema.prisma`](prisma/schema.prisma), [`src/database/prisma.ts`](src/database/prisma.ts)

**What it does**
PostgreSQL is the relational database. Prisma is a type-safe ORM — it generates a database client from your schema and manages migrations.

**Why it matters**
Replaces raw SQL with auto-completed, type-safe database operations. Migrations track every schema change so the database evolves safely alongside the code.

**Practice task**
Add a new `Post` model to `schema.prisma`. Run `prisma migrate dev`. Write a service that creates, reads, updates, and deletes posts using the generated Prisma client.

---

## Tier 2 — Auth & Security

### 5. JWT (jsonwebtoken)

**File:** [`src/utils/jwt.ts`](src/utils/jwt.ts)

**What it does**
JSON Web Tokens encode user identity into a signed, self-contained token sent with every request.

**Why it matters**
Enables stateless authentication — the server does not need a session store to verify who a user is. The token is cryptographically signed, so tampering is detectable.

**Practice task**
Manually sign a token with `jwt.sign`. Decode it with `jwt.verify`. Then tamper with the payload manually and observe the verification failure. Also test an expired token.

---

### 6. Argon2 / bcrypt

**File:** [`src/config/passport.ts`](src/config/passport.ts)

**What it does**
One-way password hashing algorithms. Plain-text passwords are never stored — only their hashes.

**Why it matters**
If your database is ever breached, hashed passwords cannot be reversed into plain text. Argon2 is the modern standard (resistant to GPU attacks); bcrypt is the battle-tested fallback.

**Practice task**
Hash a password with `argon2.hash`. Write a login check using `argon2.verify`. Test with the correct password, then a wrong one. Observe the timing difference.

---

### 7. Passport.js

**File:** [`src/config/passport.ts`](src/config/passport.ts)

**What it does**
Authentication middleware with a pluggable strategy system. This project uses `passport-local` for email/password login.

**Why it matters**
Standardizes the authentication handshake. If you later add OAuth (Google, GitHub), you add a strategy — the rest of the app stays unchanged.

**Practice task**
Set up a `passport-local` strategy that validates email + hashed password against a mock user list. Wire it into an Express route and test with valid and invalid credentials.

---

### 8. Helmet + CORS

**File:** [`src/app.ts`](src/app.ts)

**What it does**
- **Helmet** — sets secure HTTP response headers (Content-Security-Policy, X-Frame-Options, etc.)
- **CORS** — controls which domains are allowed to call your API from a browser

**Why it matters**
These are the first line of defense against XSS, clickjacking, and unauthorized cross-origin requests. They cost almost nothing to add and prevent entire classes of attacks.

**Practice task**
Remove Helmet temporarily and inspect response headers with curl or Postman. Note what is missing. Re-add it and compare. Then configure CORS to block a specific origin and verify the browser blocks the request.

---

### 9. express-rate-limit + rate-limit-redis

**File:** [`src/middlewares/rateLimiter.ts`](src/middlewares/rateLimiter.ts)

**What it does**
Limits the number of requests a client can make within a time window. The Redis backend shares counters across multiple server instances.

**Why it matters**
Protects against brute-force attacks on login and API abuse. Without rate limiting, a single attacker can hammer your server or try millions of passwords.

**Practice task**
Set a limit of 5 requests per minute on a login route. Hit it 6 times in quick succession and verify the 429 Too Many Requests response. Check the `Retry-After` header.

---

## Tier 3 — Performance & Reliability

### 10. Redis + ioredis

**Files:** [`src/config/redis.ts`](src/config/redis.ts), [`src/utils/cache.ts`](src/utils/cache.ts)

**What it does**
Redis is an in-memory key-value store — reads and writes are orders of magnitude faster than a relational database. `ioredis` is the Node.js client.

**Why it matters**
Used in this project for caching API responses, storing refresh tokens, and backing the rate limiter and job queue. Dramatically reduces database load under heavy traffic.

**Practice task**
Pick any expensive DB query. On first request, fetch from Postgres and store the result in Redis with a 60-second TTL. On subsequent requests within that window, serve from Redis. Log which path was taken.

---

### 11. BullMQ

**Files:** [`src/config/queue.ts`](src/config/queue.ts), [`src/modules/email/producer.ts`](src/modules/email/producer.ts)

**What it does**
Job queue backed by Redis. Producers add jobs; workers pick them up and process them asynchronously in the background.

**Why it matters**
Sending email synchronously inside an HTTP handler is slow and unreliable. With BullMQ, the handler adds a job to the queue and returns instantly — a background worker handles the heavy work independently.

**Practice task**
Create a queue called `"greet"`. Add a job `{ name: "Alice" }` from a route handler. Write a worker that logs `Hello, Alice!`. Observe the async processing in the logs.

---

### 12. Nodemailer

**File:** [`src/config/email.ts`](src/config/email.ts)

**What it does**
Sends emails from Node.js via SMTP or third-party services (SendGrid, SES, etc.).

**Why it matters**
Every production app needs transactional email — welcome messages, password resets, notifications. Nodemailer is the standard Node.js solution.

**Practice task**
Use Nodemailer with [Ethereal](https://ethereal.email) (free fake SMTP — no real emails sent). Send a test email and preview it in the browser via the Ethereal link in the console output.

---

## Tier 4 — Real-time & File Handling

### 13. Socket.io

**File:** [`src/server.ts`](src/server.ts)

**What it does**
WebSocket library enabling persistent, bidirectional communication between server and client. Falls back to long-polling if WebSockets are unavailable.

**Why it matters**
Powers real-time features — live notifications, progress updates, collaborative editing — without the client needing to poll repeatedly.

**Practice task**
Build a simple chat room. Client emits a `"message"` event; server broadcasts it to all connected clients. Then add a `"typing"` event that shows who is currently typing.

---

### 14. Multer

**File:** [`src/middlewares/upload.ts`](src/middlewares/upload.ts)

**What it does**
Express middleware for handling `multipart/form-data` — the encoding browsers use for file uploads.

**Why it matters**
File uploads are not JSON. Multer parses the binary stream and exposes the file object (name, size, mimetype, buffer) to your route handler.

**Practice task**
Create a `/upload` route. Accept a single image with Multer. Log the filename, size, and mimetype. Then add a validation check that rejects non-image files with a 400 error.

---

## Tier 5 — Observability

### 15. Pino

**File:** [`src/utils/logger.ts`](src/utils/logger.ts)

**What it does**
Extremely fast structured JSON logger. In development, `pino-pretty` formats output for readability. In production, raw JSON is shipped to log aggregation tools.

**Why it matters**
`console.log` is unstructured and unsearchable at scale. Structured JSON logs can be filtered, queried, and alerted on by tools like Datadog, Grafana Loki, or AWS CloudWatch.

**Practice task**
Replace all `console.log` calls in one module with `logger.info()` and `logger.error()`. Add contextual fields (`{ userId, route }`). Compare the output to raw `console.log`.

---

### 16. OpenTelemetry

**File:** [`src/instrumentation.ts`](src/instrumentation.ts)

**What it does**
Vendor-neutral observability standard. This project exports:
- **Traces** → Jaeger (follow a request across the full call chain)
- **Metrics** → Prometheus (aggregate performance numbers over time)

**Why it matters**
When something is slow or broken in a distributed system, you need to follow the exact path a request took and measure where time was spent. Logs alone cannot give you this.

**Practice task**
Send a request to a route that hits the database. Open Jaeger UI (`localhost:16686`). Find the trace and examine the span timeline — identify how long the DB query took versus the HTTP handler.

---

## Tier 6 — Testing & Code Quality

### 17. Vitest + Supertest

**Files:** [`src/__tests__/`](src/__tests__/)

**What it does**
- **Vitest** — fast modern test runner (replaces Jest). Supports unit and integration tests.
- **Supertest** — fires real HTTP requests against your Express app in-process, without a running server.

**Why it matters**
Automated tests catch regressions before they reach production. Supertest lets you test full request/response cycles (auth, validation, status codes) without spinning up infrastructure.

**Practice task**
Write tests for `POST /auth/login`:
- One test with valid credentials → expect 200 and a token in the response
- One test with a wrong password → expect 401
- One test with missing fields → expect 400 with Zod validation errors

---

### 18. ESLint + Prettier + Husky + lint-staged

**What it does**
- **ESLint** — static analysis; finds bugs (unused variables, missing awaits, type errors)
- **Prettier** — enforces consistent code formatting automatically
- **Husky** — runs scripts as Git hooks (pre-commit, pre-push)
- **lint-staged** — runs ESLint and Prettier only on files staged for commit (fast)

**Why it matters**
Enforces consistent standards across an entire team without relying on manual discipline. Catches bugs in CI before they ever reach review.

**Practice task**
Intentionally write a function with an unused variable and a missing `await` on an async call. Run `npm run lint` and observe the errors. Then run `npm run format` and watch Prettier fix the formatting automatically.

---

## Summary Table

| # | Technology | Layer | Priority |
|---|---|---|---|
| 1 | Node.js + TypeScript | Runtime | Essential |
| 2 | Express.js | HTTP | Essential |
| 3 | Zod | Validation | Essential |
| 4 | Prisma + PostgreSQL | Database | Essential |
| 5 | JWT | Auth | Tier 2 |
| 6 | Argon2 / bcrypt | Auth | Tier 2 |
| 7 | Passport.js | Auth | Tier 2 |
| 8 | Helmet + CORS | Security | Tier 2 |
| 9 | express-rate-limit | Security | Tier 2 |
| 10 | Redis + ioredis | Caching | Tier 3 |
| 11 | BullMQ | Job Queues | Tier 3 |
| 12 | Nodemailer | Email | Tier 3 |
| 13 | Socket.io | Real-time | Tier 4 |
| 14 | Multer | File Upload | Tier 4 |
| 15 | Pino | Logging | Tier 5 |
| 16 | OpenTelemetry | Tracing/Metrics | Tier 5 |
| 17 | Vitest + Supertest | Testing | Tier 6 |
| 18 | ESLint + Prettier + Husky | Code Quality | Tier 6 |

---

> **Recommended path:** Master Tier 1 completely before moving on. Each tier builds directly on the previous one. The goal is not to memorize APIs — it is to understand *why* each tool exists and what problem it solves.
