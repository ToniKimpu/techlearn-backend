# TechLearn Backend — Rebuild Guide

## What You're Building

A production-grade Node.js + Express REST API for an educational platform. By the end, you'll have:

- **27 API endpoints** across 7 modules
- **JWT authentication** with refresh token rotation
- **Role-based access control** (admin, teacher, student)
- **PostgreSQL** database with Prisma ORM (16 models)
- **Redis** caching, session storage, and rate limiting
- **BullMQ** background email queue
- **File uploads** to Supabase Storage
- **OpenAPI/Swagger** documentation auto-generated from Zod schemas
- **OpenTelemetry** tracing + Prometheus metrics + structured logging
- **Docker** + GitHub Actions CI pipeline
- **52 tests** with Vitest + Supertest

---

## Tech Stack

| Category | Technology | Why |
|----------|-----------|-----|
| Runtime | Node.js 20 | LTS, stable |
| Framework | Express 5 | Async error handling built-in |
| Language | TypeScript (strict) | Type safety |
| Database | PostgreSQL 16 | Relational, ACID |
| ORM | Prisma | Type-safe queries, migrations |
| Cache/Sessions | Redis 7 (ioredis) | Fast in-memory store |
| Queue | BullMQ | Redis-backed job queue |
| Auth | Passport.js + JWT + argon2 | Industry standard |
| Validation | Zod | Runtime + compile-time safety |
| API Docs | zod-to-openapi + Swagger UI | Auto-generated from schemas |
| Logging | Pino | Structured JSON logs |
| Tracing | OpenTelemetry | Distributed tracing |
| Metrics | Prometheus | Time-series monitoring |
| Testing | Vitest + Supertest | Fast, ESM-native |
| File Upload | Multer + Supabase | Memory storage + cloud |
| Email | Nodemailer + BullMQ | Async email delivery |
| CI/CD | GitHub Actions + Docker | Automated pipeline |
| Code Quality | ESLint + Prettier + Husky | Consistent code |

---

## Guide Structure

Follow these guides **in order** — each builds on the previous:

| # | Guide | What You'll Build |
|---|-------|-------------------|
| 01 | [Project Setup](./01-project-setup.md) | npm, TypeScript, folder structure, ESLint, Prettier |
| 02 | [Express Server](./02-express-server.md) | Express 5 app, middleware stack, error handling, health check |
| 03 | [Database & Prisma](./03-database-prisma.md) | PostgreSQL, Docker, Prisma schema (all 16 models) |
| 04 | [Authentication](./04-auth-module.md) | Passport, argon2, JWT, refresh tokens, Redis sessions |
| 05 | [CRUD Modules](./05-crud-modules.md) | Curriculums, Grades, Subjects, Chapters with service layer |
| 06 | [Validation & Security](./06-validation-security.md) | Zod schemas, XSS sanitization, Helmet, CORS, rate limiting |
| 07 | [Redis Caching](./07-redis-caching.md) | Cache layer, cache invalidation, X-Cache headers |
| 08 | [Email Queue](./08-email-queue.md) | BullMQ producer/worker, Nodemailer, HTML templates |
| 09 | [File Upload](./09-file-upload.md) | Multer middleware, Supabase Storage integration |
| 10 | [Testing](./10-testing.md) | Vitest setup, Supertest, mocking Prisma/Redis, 52 tests |
| 11 | [OpenAPI Docs](./11-openapi-docs.md) | zod-to-openapi, Swagger UI, auto-generated spec |
| 12 | [Observability](./12-observability.md) | Pino logging, OpenTelemetry tracing, Prometheus metrics |
| 13 | [Docker & CI](./13-docker-ci.md) | Dockerfile, docker-compose, GitHub Actions, Husky hooks |

---

## Architecture Overview

```
Request Flow:
  Client → Express → Middleware Stack → Route Handler → Service → Database/Cache → Response

Middleware Stack (in order):
  Helmet → Compression → JSON Parser → CORS → Pino Logger → Tracing → Passport → Rate Limiter

Module Structure:
  src/modules/<module>/
    routes.ts    ← thin HTTP handlers (parse request → call service → send response)
    service.ts   ← ALL business logic (database, cache, validation)
    schemas.ts   ← Zod validation schemas
    openapi.ts   ← OpenAPI path registrations

Data Hierarchy:
  Curriculum → Grade → Subject → Chapter
  (each level has a foreign key to its parent)
```

---

## Tips for Self-Study

1. **Type everything yourself** — don't copy-paste. Muscle memory matters.
2. **Read the docs** for each library as you encounter it (linked in each guide).
3. **Test each step** — run the server, hit the endpoint, see the result.
4. **Break things on purpose** — remove a middleware, send bad data, see what happens.
5. **Git commit after each section** — so you can revert if something breaks.
6. **Don't rush** — understanding > speed. Re-read if something is unclear.

---

## Prerequisites

- Node.js 20+ installed
- Docker Desktop (for PostgreSQL, Redis, Jaeger)
- A code editor (VS Code recommended)
- Postman or similar API client
- A Supabase account (free tier, for file storage)
- Basic understanding of: JavaScript, HTTP, REST APIs, SQL basics
