# Structured Logging (Pino)

## Why Pino

`console.log` is synchronous and unstructured — it blocks the event loop and produces plain text that is hard to search or filter in production. Pino writes **newline-delimited JSON** asynchronously, making it 5–10× faster and compatible with every log aggregation tool (Datadog, Grafana Loki, AWS CloudWatch, etc.).

## Setup

**File:** `src/utils/logger.ts`

```ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});
```

- In **development** — `pino-pretty` formats logs as human-readable coloured output.
- In **production** — raw JSON is written to stdout, which Render/Railway/Docker capture and forward to your log aggregator.

## HTTP Request Logging

`pino-http` is registered as Express middleware in `src/app.ts`:

```ts
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === "/health" }, // skip health check noise
}));
```

Every request automatically produces a log line:

```json
{
  "level": "info",
  "time": 1700000000000,
  "method": "GET",
  "url": "/api/v1/curriculums",
  "statusCode": 200,
  "responseTime": 43
}
```

## Log Levels

| Level | When to use |
|---|---|
| `logger.trace` | Extremely verbose debug info |
| `logger.debug` | Development debug info |
| `logger.info` | Normal operations (server start, socket connect) |
| `logger.warn` | Something unexpected but not fatal |
| `logger.error` | Errors that need attention |
| `logger.fatal` | App cannot continue |

Control the minimum level with `LOG_LEVEL` env var (default: `info`).

## Usage in Code

```ts
import { logger } from "../../utils/logger.js";

// Structured — preferred
logger.info({ userId: "abc", curriculumId: 5 }, "Curriculum accessed");
logger.error({ err }, "Database query failed");

// Simple message
logger.warn("Redis unavailable, falling back to DB");
```

Always pass context as the **first object argument**. The message is always the last string argument.

## Error Logging

The global error handler in `src/app.ts` logs unhandled errors with full stack trace:

```ts
app.use((err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  logger.error({ err }, "Unhandled error"); // pino serializes err.stack automatically
  return res.status(500).json({ error: "Internal Server Error" });
});
```

## Development Output (pino-pretty)

```
INFO  [09:00:00] Server started { port: 4000 }
INFO  [09:00:01] request completed { method: "GET", url: "/api/v1/curriculums", statusCode: 200, responseTime: 43 }
ERROR [09:00:02] Unhandled error { err: { message: "...", stack: "..." } }
```

## Production Output (JSON)

```json
{"level":30,"time":1700000000000,"msg":"Server started","port":4000}
{"level":30,"time":1700000000100,"msg":"request completed","method":"GET","url":"/api/v1/curriculums","statusCode":200,"responseTime":43}
```
