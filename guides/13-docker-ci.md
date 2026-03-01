# 13 — Docker & CI/CD

## Goal

Containerize the app with Docker, orchestrate services with Docker Compose, and set up GitHub Actions for automated testing.

---

## 13.1 Dockerfile (Multi-Stage Build)

Create `Dockerfile`:

```dockerfile
# ---- Build Stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files (cached layer — only re-runs if dependencies change)
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Copy compiled code and generated Prisma client from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/prisma ./prisma

EXPOSE 4000

CMD ["node", "--import", "./dist/instrumentation.js", "dist/server.js"]
```

**Multi-stage builds explained:**

```
Stage 1 (build):
  Full Node.js + all dependencies + TypeScript compiler
  → Compiles TS to JS
  → ~500MB image

Stage 2 (production):
  Minimal Node.js + production dependencies only
  → Copies compiled JS from stage 1
  → ~150MB image (3x smaller!)
```

**Why?**
- Production image doesn't need TypeScript, ESLint, Vitest, or type definitions
- Smaller image = faster deploys, less attack surface
- Docker layer caching: `npm ci` only re-runs when package.json changes

**CMD explained:**
- `--import ./dist/instrumentation.js` — Load OTel before everything else
- `dist/server.js` — The compiled entry point

---

## 13.2 .dockerignore

Create `.dockerignore`:

```
node_modules
dist
.env
*.log
.git
.github
docs
guides
```

**Why?** Without this, Docker copies `node_modules` (huge!) into the build context. The `.dockerignore` tells Docker to skip these files.

---

## 13.3 Full Docker Compose

Update `docker-compose.yml` with all services:

```yaml
services:
  # PostgreSQL database
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: techlearn
      POSTGRES_PASSWORD: techlearn
      POSTGRES_DB: techlearn
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U techlearn"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Redis cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/var/lib/redis/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Jaeger tracing
  jaeger:
    image: jaegertracing/all-in-one:latest
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "16686:16686"  # UI
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP

  # Application
  app:
    build: .
    ports:
      - "4000:4000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
      jaeger:
        condition: service_started
    environment:
      DATABASE_URL: postgresql://techlearn:techlearn@db:5432/techlearn?sslmode=disable
      DIRECT_URL: postgresql://techlearn:techlearn@db:5432/techlearn?sslmode=disable
      JWT_SECRET: docker-dev-secret-at-least-32-chars-long
      REDIS_URL: redis://redis:6379
      FRONTEND_URL: http://localhost:3000
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4318/v1/traces
      OTEL_SERVICE_NAME: techlearn-backend
      NODE_ENV: production

volumes:
  pgdata:
  redisdata:
```

**Key Docker Compose concepts:**

- `depends_on` with `condition: service_healthy` — App waits for DB and Redis to be ready
- `db:5432` instead of `localhost:5432` — Inside Docker network, services use their service name as hostname
- `${SUPABASE_URL}` — Reads from `.env` file (Docker Compose auto-loads it)

**Usage:**
```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f app

# Stop everything
docker compose down

# Rebuild app after code changes
docker compose up -d --build app
```

---

## 13.4 GitHub Actions CI

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      JWT_SECRET: ci-test-secret-at-least-32-characters-long
      DATABASE_URL: postgresql://test:test@localhost:5432/test
      SUPABASE_URL: https://test.supabase.co
      SUPABASE_SERVICE_ROLE_KEY: test-key
      REDIS_URL: redis://localhost:6379

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Lint
        run: npm run lint

      - name: Check formatting
        run: npm run format:check

      - name: Run tests
        run: npm test
```

**CI pipeline explained:**

```
Every push to main / every PR:
  1. Start Redis service (for rate limiter tests, if needed)
  2. Checkout code
  3. Install Node.js 20 (with npm cache for speed)
  4. npm ci (clean install — uses package-lock.json exactly)
  5. Generate Prisma client (needed for type imports)
  6. npm run lint — ESLint catches code quality issues
  7. npm run format:check — Prettier ensures consistent formatting
  8. npm test — All 52 tests must pass

If ANY step fails → PR gets a red X → can't merge
```

**Why this order?**
- Lint before test — faster to catch syntax issues than to run tests
- format:check (not format) — don't auto-fix in CI, just verify

---

## 13.5 Husky Pre-Commit Hooks (Recap)

From guide 01, you set up:

```bash
# .husky/pre-commit
npx lint-staged
```

```json
// package.json
{
  "lint-staged": {
    "src/**/*.ts": ["prettier --write", "eslint --fix"]
  }
}
```

**Local vs CI quality gates:**

```
Local (pre-commit):
  → Prettier auto-formats staged files
  → ESLint auto-fixes staged files
  → If unfixable errors → commit blocked

CI (GitHub Actions):
  → Catches anything that slipped through (force-push, --no-verify)
  → More thorough (runs ALL files, not just staged)
  → Final safety net
```

---

## 13.6 Development vs Production

```
Development:
  npm run dev              → tsx watch (hot-reload, no build step)
  docker compose up -d db redis jaeger   → Only infrastructure
  .env                     → Local credentials

Production (Docker):
  docker compose up -d     → All services including app
  Dockerfile               → Multi-stage build
  Environment vars         → Injected via docker-compose

CI:
  npm test                 → Tests with mocked dependencies
  No real DB needed        → Prisma only generates types
  Redis service            → For integration tests if needed
```

---

## 13.7 Full docker-compose Workflow

```bash
# First time setup
docker compose up -d db redis jaeger     # Start infrastructure
npm run dev                               # Start app locally

# Full Docker setup (for testing production)
docker compose up -d --build              # Build and start everything
docker compose logs -f app                # Watch app logs
curl http://localhost:4000/health          # Test health check

# Cleanup
docker compose down                       # Stop all
docker compose down -v                    # Stop + delete volumes (fresh start)
```

---

## Checkpoint

- [x] Multi-stage Dockerfile (build + production)
- [x] .dockerignore
- [x] docker-compose.yml (PostgreSQL, Redis, Jaeger, App)
- [x] Health checks for DB and Redis
- [x] GitHub Actions CI (lint → format:check → test)
- [x] Husky pre-commit hooks
- [x] Three-tier quality gates (local → pre-commit → CI)

**Commit:** `git commit -m "add Dockerfile, docker-compose, and GitHub Actions CI"`

---

## Key Concepts to Understand

1. **Docker multi-stage builds** — Read: https://docs.docker.com/build/building/multi-stage/
2. **Docker Compose** — Multi-container orchestration: https://docs.docker.com/compose/
3. **GitHub Actions** — CI/CD pipeline: https://docs.github.com/en/actions/quickstart
4. **Layer caching** — Why COPY package.json before COPY src/: https://docs.docker.com/build/cache/
5. **Health checks** — Why `depends_on` alone isn't enough: container can be "up" but service not ready
6. **npm ci vs npm install** — `ci` uses package-lock.json exactly (deterministic). `install` may update it.

---

## You're Done!

Congratulations! You've built a production-grade Node.js backend from scratch:

- 27 API endpoints across 7 modules
- JWT auth with refresh token rotation
- PostgreSQL + Prisma ORM
- Redis caching with invalidation
- BullMQ email queue
- Supabase file storage
- OpenAPI/Swagger docs
- OpenTelemetry tracing + Prometheus metrics
- Docker + CI pipeline
- 52 tests

This is a solid intermediate-to-advanced backend project. To reach senior level, consider next:
- Cursor-based pagination (instead of offset)
- E2E tests with real database
- WebSocket real-time features
- API versioning strategy
- Database connection pooling tuning
- Kubernetes deployment
- Performance profiling and optimization
