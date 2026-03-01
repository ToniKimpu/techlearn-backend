# 12 — Observability (Logging + Tracing + Metrics)

## Goal

Add the three pillars of observability: structured logging (Pino), distributed tracing (OpenTelemetry + Jaeger), and metrics (Prometheus).

---

## 12.1 Why Observability?

```
Without observability:
  User: "The API is slow"
  You:  "Which endpoint? When? For which user? What was the DB doing?"
  You:  *checks console.log* "I have no idea."

With observability:
  → Logs: structured JSON with trace_id, user_id, duration
  → Traces: visual timeline showing exactly where time was spent
  → Metrics: graphs of request rates, error rates, cache hit ratios
```

The three pillars work together:
- **Logs** — Tell you WHAT happened (request failed, user registered)
- **Traces** — Tell you WHERE time was spent (DB query took 500ms)
- **Metrics** — Tell you HOW MUCH (100 requests/min, 5% error rate)

---

## 12.2 Install Dependencies

```bash
npm install @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-prometheus \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

---

## 12.3 Structured Logging (Already Done)

You set up Pino in guide 02. Here's what makes it powerful:

```typescript
// Instead of:
console.log("User registered: " + email);

// Pino produces structured JSON:
logger.info({ email, userId: auth.id }, "User registered");
// → {"level":30,"time":1709337600000,"email":"test@test.com","userId":"abc123","msg":"User registered"}
```

**Why JSON logs?** Log aggregation tools (Datadog, CloudWatch, Loki) can parse and search JSON. With `console.log("User " + email + " registered")`, you can't filter logs by email.

After adding OpenTelemetry, Pino automatically gets `trace_id` and `span_id` injected into every log line — no code changes needed.

---

## 12.4 OpenTelemetry Instrumentation

Create `src/instrumentation.ts`:

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

// Exit early if disabled
if (process.env.OTEL_SDK_DISABLED === "true") {
  // Export dummies so other files can import without errors
  export const prometheusExporter = null as any;
  export const sdk = null as any;
} else {
  // Prometheus metrics exporter (serves at /metrics)
  const prometheusExporter = new PrometheusExporter({
    preventServerStart: true, // We serve metrics via Express, not a standalone server
  });

  // OTLP trace exporter (sends traces to Jaeger)
  const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
  });

  // Service metadata (appears in all traces and metrics)
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "techlearn-backend",
    [ATTR_SERVICE_VERSION]: "1.0.0",
    "deployment.environment": process.env.NODE_ENV || "development",
  });

  // Create the SDK
  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy instrumentations
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        // Skip health/metrics endpoints in traces
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (req) => {
            const url = req.url || "";
            return url === "/health" || url === "/metrics";
          },
        },
      }),
    ],
  });

  sdk.start();

  // Export for use in app.ts and server.ts
  export { prometheusExporter, sdk };
}
```

**CRITICAL:** This file MUST be imported FIRST in `server.ts`. OpenTelemetry works by monkey-patching Node.js modules (http, pg, ioredis) before they're loaded. If you import Express before OTel, tracing won't work.

```typescript
// src/server.ts — FIRST LINE
import "./instrumentation.js"; // Must be first!
import { app } from "./app.js";
// ...
```

**What auto-instrumentation does:**
- `http` — Traces every HTTP request/response (with method, URL, status code)
- `express` — Adds route info to HTTP spans
- `pg` — Traces every database query (with SQL statement)
- `ioredis` — Traces every Redis command
- `pino` — Injects trace_id and span_id into log lines

---

## 12.5 Custom Metrics

Create `src/utils/metrics.ts`:

```typescript
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("techlearn-backend");

// Cache hit/miss counters
export const cacheHitCounter = meter.createCounter("cache_hits_total", {
  description: "Total number of cache hits",
});

export const cacheMissCounter = meter.createCounter("cache_misses_total", {
  description: "Total number of cache misses",
});

// Auth failure counter
export const authFailureCounter = meter.createCounter("auth_failures_total", {
  description: "Total number of authentication failures",
});

// Email job counter
export const emailJobCounter = meter.createCounter("email_jobs_total", {
  description: "Total number of email jobs enqueued",
});
```

Use these in your code:

```typescript
// In cache.ts:
import { cacheHitCounter, cacheMissCounter } from "./metrics.js";

export async function getCache<T>(key: string): Promise<CacheResult<T>> {
  // ...
  const prefix = key.split(":")[0];

  if (cached) {
    cacheHitCounter.add(1, { key_prefix: prefix });
    return { data: JSON.parse(cached), hit: true };
  }

  cacheMissCounter.add(1, { key_prefix: prefix });
  return { data: null, hit: false };
}
```

---

## 12.6 Tracing Middleware

Create `src/middlewares/tracing.ts`:

```typescript
import { trace } from "@opentelemetry/api";
import { Request, Response, NextFunction } from "express";

// Inject X-Trace-Id header into every response
export function traceHeaderMiddleware(req: Request, res: Response, next: NextFunction) {
  const span = trace.getActiveSpan();
  if (span) {
    const traceId = span.spanContext().traceId;
    res.set("X-Trace-Id", traceId);
  }
  next();
}

// Enrich spans with user info (run AFTER requireAuth)
export function userSpanMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.authUser) {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute("user.id", req.authUser.authId);
      span.setAttribute("user.type", req.authUser.userType);
    }
  }
  next();
}
```

**X-Trace-Id header:** When the frontend gets a response, it can include this trace ID in bug reports. You then search Jaeger for that trace ID and see exactly what happened.

**User attributes on spans:** When you filter traces in Jaeger, you can find all traces for a specific user.

---

## 12.7 Prometheus Metrics Endpoint

In `src/app.ts`:

```typescript
import { prometheusExporter } from "./instrumentation.js";

// Prometheus metrics endpoint
if (prometheusExporter) {
  app.get("/metrics", prometheusExporter.getMetricsRequestHandler());
}
```

Visit `http://localhost:4000/metrics` to see raw Prometheus metrics:

```
# HELP cache_hits_total Total number of cache hits
# TYPE cache_hits_total counter
cache_hits_total{key_prefix="curriculums"} 42

# HELP http_server_duration_milliseconds Duration of HTTP requests
# TYPE http_server_duration_milliseconds histogram
http_server_duration_milliseconds_bucket{method="GET",route="/api/v1/curriculums",le="100"} 95
```

---

## 12.8 Jaeger (Trace Viewer)

Add Jaeger to `docker-compose.yml`:

```yaml
  jaeger:
    image: jaegertracing/all-in-one:latest
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "16686:16686"  # Jaeger UI
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP
```

```bash
docker compose up -d jaeger
```

Open `http://localhost:16686` — the Jaeger UI.

**What you'll see:**
1. Select "techlearn-backend" service
2. Click "Find Traces"
3. See every HTTP request as a trace
4. Click a trace to see the full timeline:
   - HTTP request (50ms total)
     - Express middleware (2ms)
     - PostgreSQL query (30ms)
     - Redis GET (5ms)
     - Response sent (1ms)

---

## 12.9 Update Production Start Command

```json
{
  "scripts": {
    "start": "node --import ./dist/instrumentation.js dist/server.js"
  }
}
```

The `--import` flag tells Node.js to load the instrumentation module before anything else.

---

## 12.10 Update Graceful Shutdown

In `src/server.ts`:

```typescript
import { prometheusExporter, sdk } from "./instrumentation.js";

// In shutdown function:
if (sdk) {
  await sdk.shutdown();
}
if (prometheusExporter) {
  await prometheusExporter.shutdown();
}
```

---

## 12.11 How It All Connects

```
Request: POST /api/v1/auth/register
  │
  ├── OTel creates HTTP span (auto)
  │     ├── Express route span (auto)
  │     ├── Prisma query span (auto): "INSERT INTO auth..."
  │     ├── Redis SET span (auto): "session:user:token"
  │     └── Custom span attributes: user.id, user.type
  │
  ├── Pino log: { "msg": "User registered", "trace_id": "abc123", "span_id": "def456" }
  │
  ├── Prometheus counter: auth_registrations_total++
  │
  └── Response header: X-Trace-Id: abc123
```

Given trace_id "abc123":
- **Jaeger:** Search by trace ID → see full request timeline
- **Logs:** Filter by trace_id → see all log lines for that request
- **Metrics:** See trends (requests/sec, errors/sec, latencies)

---

## Checkpoint

- [x] OpenTelemetry SDK with auto-instrumentation
- [x] Traces sent to Jaeger (OTLP HTTP)
- [x] Prometheus metrics endpoint at /metrics
- [x] Custom business metrics (cache hits, auth failures, email jobs)
- [x] Pino logs with trace_id/span_id correlation
- [x] X-Trace-Id response header
- [x] User attributes on spans
- [x] Jaeger UI for trace visualization

**Commit:** `git commit -m "add OpenTelemetry tracing, Prometheus metrics, and log correlation"`

---

## Key Concepts to Understand

1. **Three pillars of observability** — Logs, traces, metrics: https://opentelemetry.io/docs/concepts/
2. **OpenTelemetry** — Vendor-neutral instrumentation: https://opentelemetry.io/docs/languages/js/
3. **Distributed tracing** — How traces work across services: https://opentelemetry.io/docs/concepts/signals/traces/
4. **Prometheus** — Metrics collection: https://prometheus.io/docs/introduction/overview/
5. **Jaeger** — Trace visualization: https://www.jaegertracing.io/docs/
6. **Structured logging** — Why JSON logs matter: https://www.structlog.org/en/stable/why.html
