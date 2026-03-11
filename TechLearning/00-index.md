# TechLearn Backend — Learning Guides Index

A step-by-step learning path through every technology in `techlearn-backend`.
Each guide explains the concept, shows how it's used in **this project's actual code**, and gives you practice tasks to learn it hands-on.

---

## Learning Path

Follow these guides in order. Each tier builds on the previous one.

### Tier 1 — Core Foundations (start here)

| # | Guide | What you'll learn |
|---|---|---|
| 1 | [Node.js + TypeScript](./01-nodejs-typescript.md) | Runtime, event loop, async/await, type system |
| 2 | [Express.js](./02-express.md) | HTTP framework, middleware, routing, error handling |
| 3 | [Zod](./03-zod.md) | Runtime validation, TypeScript types from schemas |
| 4 | [Prisma + PostgreSQL](./04-prisma-postgresql.md) | ORM, schema, migrations, CRUD, relations |

### Tier 2 — Auth & Security

| # | Guide | What you'll learn |
|---|---|---|
| 5 | [JWT](./05-jwt.md) | Stateless auth, signing, verifying, refresh tokens |
| 6 | [Argon2 / bcrypt](./06-argon2-bcrypt.md) | Password hashing, why it matters, verify flow |
| 7 | [Passport.js](./07-passport.md) | Auth strategies, local strategy, done callback |
| 8 | [Helmet + CORS](./08-helmet-cors.md) | HTTP security headers, cross-origin requests |
| 9 | [Rate Limiting](./09-rate-limiting.md) | Brute-force protection, Redis-backed counters |

### Tier 3 — Performance & Reliability

| # | Guide | What you'll learn |
|---|---|---|
| 10 | [Redis + ioredis](./10-redis.md) | In-memory caching, TTL, cache-aside pattern |
| 11 | [BullMQ](./11-bullmq.md) | Job queues, producers, workers, retry logic |
| 12 | [Nodemailer](./12-nodemailer.md) | Sending email, SMTP, Ethereal for testing |

### Tier 4 — Real-time & File Handling

| # | Guide | What you'll learn |
|---|---|---|
| 13 | [Socket.io](./13-socketio.md) | WebSockets, events, rooms, JWT auth for sockets |
| 14 | [Multer](./14-multer.md) | File uploads, multipart/form-data, file validation |

### Tier 5 — Observability

| # | Guide | What you'll learn |
|---|---|---|
| 15 | [Pino](./15-pino.md) | Structured logging, log levels, child loggers |
| 16 | [OpenTelemetry](./16-opentelemetry.md) | Distributed tracing, Jaeger, Prometheus metrics |

### Tier 6 — Testing & Code Quality

| # | Guide | What you'll learn |
|---|---|---|
| 17 | [Vitest + Supertest](./17-vitest-supertest.md) | Unit tests, integration tests, testing HTTP routes |
| 18 | [ESLint + Prettier + Husky](./18-eslint-prettier-husky.md) | Linting, formatting, pre-commit hooks |

---

## How to use these guides

1. **Read** the concept section first — understand *why* the tool exists
2. **Read** the "how this project uses it" section — find the real code in `src/`
3. **Do** the practice tasks — learning sticks when you write code yourself
4. **Come back** when you encounter the tool in the codebase — re-read the relevant section

---

## Quick reference — file locations

| Technology | Key files |
|---|---|
| Express | `src/app.ts`, `src/server.ts` |
| Zod | `src/middlewares/validate.ts`, `src/modules/*/schemas.ts` |
| Prisma | `prisma/schema.prisma`, `src/database/prisma.ts` |
| JWT | `src/utils/jwt.ts`, `src/middlewares/requireAuth.ts` |
| Argon2 / Passport | `src/config/passport.ts` |
| Helmet / CORS | `src/app.ts` |
| Rate limiting | `src/middlewares/rateLimiter.ts` |
| Redis | `src/config/redis.ts`, `src/utils/cache.ts` |
| BullMQ | `src/modules/email/producer.ts`, `src/config/queue.ts` |
| Nodemailer | `src/config/email.ts` |
| Socket.io | `src/server.ts` |
| Multer | `src/middlewares/upload.ts` |
| Pino | `src/utils/logger.ts` |
| OpenTelemetry | `src/instrumentation.ts` |
| Tests | `src/__tests__/` |
