# Health Check Endpoint

## What It Is

`GET /health` is a lightweight endpoint that checks whether the application's critical dependencies (PostgreSQL and Redis) are reachable. It is used by load balancers, container orchestrators (Docker, Kubernetes), and deployment platforms (Render, Railway) to decide whether to route traffic to this instance.

## Endpoint

```
GET /health
```

No authentication required — load balancers must be able to call this without a token.

## Response — Healthy (200)

```json
{
  "status": "ok",
  "db": "ok",
  "redis": "ok",
  "uptime": 3600
}
```

## Response — Degraded (503)

Returned when any dependency check fails. The HTTP status `503 Service Unavailable` signals to load balancers that this instance should be taken out of rotation.

```json
{
  "status": "degraded",
  "db": "error",
  "redis": "ok",
  "uptime": 120
}
```

## Redis States

| Value | Meaning |
|---|---|
| `"ok"` | Redis is connected and responding to `PING` |
| `"unavailable"` | Redis is not configured (no `REDIS_URL` env var) — non-fatal |
| `"error"` | Redis is configured but not responding — degraded |

`"unavailable"` does **not** degrade the status because Redis is optional (the app falls back to DB queries when Redis is down).

## Implementation

Located in `src/app.ts`:

```ts
app.get("/health", async (_req, res) => {
  const checks = { db: "ok", redis: "ok" };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    checks.db = "error";
  }

  if (!redis) {
    checks.redis = "unavailable";
  } else {
    try {
      await redis.ping();
    } catch {
      checks.redis = "error";
    }
  }

  const status = Object.values(checks).some((v) => v === "error") ? "degraded" : "ok";
  return res.status(status === "ok" ? 200 : 503).json({
    status,
    ...checks,
    uptime: Math.floor(process.uptime()),
  });
});
```

## Excluded from Request Logs

Health check calls are excluded from pino-http logs to prevent log noise from frequent polling:

```ts
app.use(pinoHttp({
  autoLogging: { ignore: (req) => req.url === "/health" },
}));
```

## Docker Integration

In `Dockerfile` or `docker-compose.yml`:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

Docker will mark the container as `unhealthy` if `/health` returns a non-2xx status, and restart it automatically.

## Render / Railway Integration

Both platforms support health check URLs in their dashboard settings. Set the health check path to `/health`. The platform will:

1. Poll `/health` every 30s
2. Stop routing traffic if it returns 503
3. Restart the service if it stays degraded

## Uptime Field

`uptime` is `process.uptime()` in seconds — how long the Node.js process has been running. Useful for detecting frequent restarts (e.g., crash loops).
