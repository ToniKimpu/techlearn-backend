# 02 — Express Server

## Goal

Set up Express 5 with a proper middleware stack, error handling, health check, and graceful shutdown.

---

## 2.1 Install Dependencies

```bash
npm install express compression helmet cors pino pino-http pino-pretty dotenv
npm install -D @types/express @types/compression @types/cors
```

| Package | Purpose |
|---------|---------|
| `express` (v5) | Web framework — handles HTTP routing and middleware |
| `compression` | Gzip compresses responses (saves bandwidth) |
| `helmet` | Sets security-related HTTP headers |
| `cors` | Cross-Origin Resource Sharing (lets frontend talk to API) |
| `pino` | Structured JSON logger (fast, production-grade) |
| `pino-http` | Auto-logs every HTTP request/response |
| `pino-pretty` | Pretty-prints pino logs in development |
| `dotenv` | Loads `.env` file into `process.env` |

---

## 2.2 Environment Config

Create `src/config/env.ts`:

```typescript
import "dotenv/config";

// Validate that critical env vars exist at startup
// Fail FAST — don't let the server start with missing config
const required = ["JWT_SECRET", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
```

**Why fail fast?** If you're missing a database URL, everything will break anyway. Better to crash immediately with a clear error than to start serving requests and fail mysteriously later.

**Important:** Import this file early (in `app.ts`) so env vars are validated before anything uses them.

---

## 2.3 Logger

Create `src/utils/logger.ts`:

```typescript
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }  // Colorful, readable logs in dev
      : undefined,                  // Raw JSON in production (for log aggregation)
});

export default logger;
```

**Why Pino over console.log?**
- Structured JSON output (parseable by log aggregation tools)
- Log levels (debug, info, warn, error)
- 5x faster than Winston/Bunyan
- OTel integration adds trace_id automatically (later in guide 12)

---

## 2.4 Custom Error Class

Create `src/utils/errors.ts`:

```typescript
export class AppError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
```

**Why a custom error class?** So you can throw errors with HTTP status codes anywhere in your code, and the global error handler (in `app.ts`) catches them all in one place:

```typescript
// In any service file:
throw new AppError(404, "Curriculum not found");
// → Global handler returns: { "message": "Curriculum not found" } with status 404
```

---

## 2.5 Express App

Create `src/app.ts`:

```typescript
import "./config/env.js"; // Validate env vars FIRST

import express, { Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import logger from "./utils/logger.js";
import { AppError } from "./utils/errors.js";

// BigInt JSON serialization fix
// BigInt can't be serialized to JSON by default — this fixes it
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();

// --- Middleware Stack (ORDER MATTERS) ---

// 1. Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet());

// 2. Gzip compression for responses
app.use(compression());

// 3. Parse JSON request bodies
app.use(express.json());

// 4. CORS — allow frontend to make requests
const CORS_ORIGIN = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

// 5. HTTP request logging (skip health check and metrics — too noisy)
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => {
        const url = (req as Request).originalUrl;
        return url === "/health" || url === "/metrics";
      },
    },
  })
);

// --- Routes ---

// Root — simple check that API is running
app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "TechLearn API is running" });
});

// Health check — tests database and cache connectivity
app.get("/health", async (_req: Request, res: Response) => {
  // For now, just return ok. We'll add DB/Redis checks after setting them up.
  res.json({
    status: "ok",
    uptime: process.uptime(),
  });
});

// Mount module routes here later:
// app.use("/api/v1/auth", authRoutes);
// app.use("/api/v1/curriculums", curriculumRoutes);
// etc.

// --- Global Error Handler ---
// This MUST be the last middleware. Express calls it when next(error) is called
// or when an async route handler throws.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Known application errors (you threw them on purpose)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  // Unknown errors (bugs, unhandled exceptions)
  logger.error(err, "Unhandled error");
  res.status(500).json({ message: "Internal server error" });
});

export { app, CORS_ORIGIN };
```

**Middleware order matters!** Each middleware processes the request in order:
1. **Helmet** — adds security headers before anything else
2. **Compression** — wraps the response stream to compress it
3. **JSON parser** — makes `req.body` available
4. **CORS** — allows cross-origin requests (needed for frontend)
5. **Pino HTTP** — logs the request (after JSON parse, so body is available)

**Express 5 difference:** Async errors in route handlers are automatically caught — no need for `try/catch` in every route. Express 5 calls the error handler automatically.

---

## 2.6 HTTP Server with Graceful Shutdown

Create `src/server.ts`:

```typescript
import { createServer } from "node:http";
import { app } from "./app.js";
import logger from "./utils/logger.js";

const PORT = process.env.PORT || 4000;

const server = createServer(app);

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// --- Graceful Shutdown ---
// When the process receives a termination signal (e.g., Docker stop, Ctrl+C),
// we want to:
// 1. Stop accepting new connections
// 2. Wait for in-flight requests to finish
// 3. Close database/cache connections
// 4. Exit cleanly

const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Force exit after 10 seconds if shutdown hangs
  const forceTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10_000);

  try {
    // Stop accepting new connections
    server.close(() => {
      logger.info("HTTP server closed");
    });

    // Close database and cache connections here (added in later guides):
    // await prisma.$disconnect();
    // redis?.disconnect();

    clearTimeout(forceTimeout);
    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error(error, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

**Why graceful shutdown?**
- In production (Docker, Kubernetes), your app receives SIGTERM before being killed
- Without graceful shutdown, in-flight requests get dropped and DB connections leak
- The 10-second timeout prevents the app from hanging forever

---

## 2.7 Test It

```bash
npm run dev
```

You should see:
```
Server running on port 4000
```

Test the endpoints:

```bash
# Root
curl http://localhost:4000/
# → {"message":"TechLearn API is running"}

# Health check
curl http://localhost:4000/health
# → {"status":"ok","uptime":5.123}
```

Press `Ctrl+C` — you should see the graceful shutdown messages.

---

## 2.8 Understanding the Request Lifecycle

When a request hits your server, here's what happens:

```
1. Client sends: POST /api/v1/auth/register { email, password, name }

2. Express middleware chain (top to bottom):
   → helmet()          sets security headers
   → compression()     prepares response compression
   → express.json()    parses body into req.body
   → cors()            adds CORS headers
   → pinoHttp()        logs: "POST /api/v1/auth/register"
   → rateLimiter()     checks rate limit (added later)

3. Route handler:
   → authRoutes        matches POST /register
   → validate()        validates req.body against Zod schema
   → service.register()  business logic (hash password, create user)
   → res.status(201).json(result)

4. If anything throws:
   → Global error handler catches it
   → If AppError: returns statusCode + message
   → If unknown: logs error, returns 500
```

---

## Checkpoint

At this point you should have:

- [x] Express 5 app with full middleware stack
- [x] Environment validation (fails fast on missing vars)
- [x] Structured logging with Pino
- [x] Custom AppError class
- [x] Health check endpoint
- [x] Graceful shutdown
- [x] BigInt JSON serialization

**Commit:** `git commit -m "add Express server with middleware, error handling, graceful shutdown"`

---

## Key Concepts to Understand

1. **Express middleware** — Functions that process requests in order. Read: https://expressjs.com/en/guide/using-middleware.html
2. **Error handling in Express 5** — Async errors auto-propagate. Read: https://expressjs.com/en/guide/error-handling.html
3. **Graceful shutdown** — Why and how: https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/
4. **Helmet security headers** — What each header does: https://helmetjs.github.io/
5. **Pino vs console.log** — Structured logging: https://github.com/pinojs/pino
