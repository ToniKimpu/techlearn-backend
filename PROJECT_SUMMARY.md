# TechLearn Backend — Project Summary

A production-grade Node.js REST API built step-by-step to reach senior-level backend engineering skills.

---

## What I Built

### Core Server
- Express 5 + TypeScript with structured module architecture
- Global error handling via custom `AppError` class
- Pino structured logging with request correlation IDs
- Graceful shutdown on `SIGTERM`/`SIGINT`

### Authentication
- Register/login with **Argon2** password hashing
- **JWT access tokens** (short-lived) + **refresh tokens** (Redis-stored)
- Passport.js local strategy
- Role-Based Access Control (RBAC) — student, teacher, admin
- Per-user rate limiting to prevent brute force

### Database
- **PostgreSQL** via **Prisma ORM** (with pg adapter)
- Relational schema: curriculums → grades → subjects → chapters
- BigInt primary keys on all CRUD models
- Offset-based pagination on list endpoints

### CRUD Modules
Thin `routes.ts` → business logic in `service.ts` → Zod `schemas.ts` per module:
`auth`, `curriculums`, `grades`, `subjects`, `chapters`, `email`, `upload`

### Caching & Queues
- **Redis** (ioredis) for refresh token sessions and response caching
- **BullMQ** email job queue with a dedicated worker
- **Nodemailer** for transactional emails (queued, not inline)

### File Upload
- **Supabase Storage** integration via `uploadToStorage()`

### Security & Validation
- **Zod** schema validation on all request bodies
- **Helmet** HTTP security headers
- **XSS sanitization** on user input
- **CORS** configured
- **Compression** middleware
- **ETag** support for conditional requests

### Observability
- **OpenTelemetry** distributed tracing (OTLP → Jaeger)
- **Prometheus** metrics at `GET /metrics`
- Custom instruments: cache hit/miss, auth failures, email jobs
- Trace ID injected into every log line via pino instrumentation
- `X-Trace-Id` response header on every request

### API Documentation
- **OpenAPI 3.0.3** spec via `zod-to-openapi`
- **Swagger UI** at `GET /docs` | raw spec at `GET /docs/json`
- 27 endpoints documented across 7 tags, Bearer auth scheme

### Testing & CI
- **Vitest** + **Supertest** — 52 passing integration tests
- Prisma and Redis mocked per-test
- **ESLint** (flat config) + **Prettier** + **Husky** pre-commit hooks
- **GitHub Actions** CI: lint → format check → tests
- **Docker Compose** for local dev (Postgres, Redis, Jaeger)

---

## What I Know From This Project

| Topic | Skill Level |
|---|---|
| Express routing, middleware, error handling | Solid |
| JWT auth + refresh token rotation | Solid |
| Prisma ORM + PostgreSQL schema design | Solid |
| Redis caching patterns + session management | Solid |
| BullMQ job queues + async email processing | Solid |
| Zod validation + OpenAPI doc generation | Solid |
| OpenTelemetry tracing + Prometheus metrics | Good |
| Service layer architecture (thin routes) | Solid |
| TypeScript for backend (types, generics) | Good |
| ESLint/Prettier/Husky toolchain | Solid |
| Vitest unit + integration testing | Good |
| Docker Compose local dev setup | Familiar |
| GitHub Actions CI pipelines | Familiar |
| RBAC, argon2, XSS sanitization | Good |

---

## Architecture Pattern

```
src/modules/<module>/
  routes.ts    — parse request, call service, send response
  service.ts   — all business logic (DB, cache, tokens)
  schemas.ts   — Zod validation schemas
  openapi.ts   — OpenAPI path registrations
```

---

## Current Level

**Intermediate → Advanced (entry)**

Still to do: cursor-based pagination, CSRF protection, E2E tests, cloud deployment, WebSockets, GraphQL.
