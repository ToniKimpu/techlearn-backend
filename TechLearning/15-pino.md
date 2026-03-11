# 15 — Pino (Structured Logging)

## What is Pino?

Pino is a fast, **structured JSON logger** for Node.js. "Structured" means logs are emitted as JSON objects instead of plain text strings.

```
console.log("User logged in: alice@example.com");
// Output: User logged in: alice@example.com
// ↑ Hard to search, filter, or aggregate at scale

logger.info({ userId: "uuid-123", email: "alice@example.com" }, "User logged in");
// Output: {"level":30,"time":1715000000000,"userId":"uuid-123","email":"alice@example.com","msg":"User logged in"}
// ↑ Every field is searchable in log aggregation tools
```

Structured logs can be sent to tools like **Datadog**, **Grafana Loki**, or **AWS CloudWatch** where you can query them:
```
Find all errors where userId = "uuid-123" in the last 24 hours
```

---

## How this project uses Pino

Logger definition in [`src/utils/logger.ts`](../src/utils/logger.ts):

```ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",

  // In development: pretty-print with colors
  // In production: raw JSON (fast, suitable for log aggregation)
  ...(process.env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, ignore: "pid,hostname" },
        },
      }
    : {}),
});
```

Used throughout the application:

```ts
// src/server.ts
logger.info({ port: PORT }, "Server started");
logger.info({ authId: socket.data.user?.authId }, "Socket connected");
logger.error({ err }, "Unhandled error");

// src/config/redis.ts
logger.info("[Redis] Connected");
logger.warn("[Redis] Not available, caching disabled");

// src/config/queue.ts
logger.info("[Worker] Job %s completed", job.id);
logger.error("[Worker] Job %s failed: %s", job?.id, error.message);
```

HTTP request logging uses `pino-http` in [`src/app.ts`](../src/app.ts):

```ts
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/health" || req.url === "/metrics",
    },
  })
);
```

This automatically logs every incoming request and response with timing, status code, and URL — without writing any per-route code.

---

## Log levels

Pino uses numeric levels:

| Level | Number | When to use |
|---|---|---|
| `trace` | 10 | Very detailed debug info |
| `debug` | 20 | Developer debug info |
| `info` | 30 | Normal operations (default) |
| `warn` | 40 | Something unexpected but recoverable |
| `error` | 50 | Something failed |
| `fatal` | 60 | App about to crash |

Setting `level: "info"` means only `info`, `warn`, `error`, and `fatal` are emitted. `trace` and `debug` are silently dropped (zero cost).

```ts
logger.trace("Very detailed info");  // ignored if level is "info"
logger.debug("Debug info");          // ignored if level is "info"
logger.info("Normal operation");     // ✓ emitted
logger.warn("Something odd");        // ✓ emitted
logger.error({ err }, "Failed");     // ✓ emitted
logger.fatal("Crashing now");        // ✓ emitted
```

---

## Passing context to logs

Always include relevant context as the first object argument:

```ts
// Bad — just a string, not searchable
logger.info("User logged in alice@example.com");

// Good — structured context
logger.info({ userId: "uuid-123", email: "alice@example.com", ip: "1.2.3.4" }, "User logged in");

// Error logging — always pass the error as { err }
try {
  await db.query(...);
} catch (err) {
  logger.error({ err, userId: "uuid-123" }, "Database query failed");
  // Pino serializes err automatically: { message, stack, code }
}
```

---

## Child loggers

Child loggers inherit parent settings but add permanent fields to every log line — useful for request-scoped context:

```ts
const requestLogger = logger.child({ requestId: "req-abc-123" });

requestLogger.info("Processing started");
// { "requestId": "req-abc-123", "msg": "Processing started" }

requestLogger.info("DB query executed");
// { "requestId": "req-abc-123", "msg": "DB query executed" }
// ↑ requestId appears on every line automatically
```

---

## Development vs production output

In development (`NODE_ENV !== "production"`), `pino-pretty` formats the output for readability:

```
[10:30:45.123] INFO: Server started
    port: 4000

[10:30:47.456] INFO: request completed
    method: "POST"
    url: "/api/v1/auth/login"
    statusCode: 200
    responseTime: 123
```

In production, raw JSON is emitted (no formatting overhead):

```json
{"level":30,"time":1715000000000,"port":4000,"msg":"Server started"}
{"level":30,"time":1715000001000,"method":"POST","url":"/api/v1/auth/login","statusCode":200,"responseTime":123,"msg":"request completed"}
```

---

## Step-by-step practice

**Task 1 — Replace console.log with Pino**

```ts
import pino from "pino";

const logger = pino({
  level: "debug",
  transport: {
    target: "pino-pretty",
    options: { colorize: true },
  },
});

// Replace these console calls with logger calls:
// console.log("Server started on port 3001");
// console.error("Database connection failed", err);

logger.info({ port: 3001 }, "Server started");
logger.error({ err: new Error("Connection refused") }, "Database connection failed");
logger.warn({ retries: 3 }, "Redis not available, falling back to in-memory");
logger.debug({ query: "SELECT * FROM users", duration: 42 }, "DB query completed");
```

**Task 2 — Create a request logger middleware**

```ts
import express from "express";
import pino from "pino";

const logger = pino({ transport: { target: "pino-pretty" } });

const app = express();

app.use((req, res, next) => {
  const start = Date.now();
  const reqLogger = logger.child({ requestId: Math.random().toString(36).slice(2) });

  reqLogger.info({ method: req.method, url: req.url }, "Request received");

  res.on("finish", () => {
    const duration = Date.now() - start;
    reqLogger.info(
      { statusCode: res.statusCode, duration },
      "Request completed"
    );
  });

  next();
});

app.get("/hello", (_, res) => {
  res.json({ message: "hello" });
});

app.listen(3001);
```

**Task 3 — Observe the difference between environments**

Run with production mode and pipe to a JSON formatter:
```bash
NODE_ENV=production npx tsx server.ts | npx pino-pretty
```

Then run in dev mode and compare the output:
```bash
NODE_ENV=development npx tsx server.ts
```

---

## Key takeaways

- Pino emits structured JSON logs, not unstructured strings
- Structured logs are searchable and aggregatable at scale — use them in production
- `pino-pretty` formats logs for human-readable output in development
- Always pass context as the first object argument, message as the second
- Use log levels correctly: `info` for normal operations, `error` for failures
- Child loggers add permanent fields to all their log lines — useful for request tracing
- `pino-http` auto-logs every HTTP request/response without manual per-route code
