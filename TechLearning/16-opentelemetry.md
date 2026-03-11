# 16 — OpenTelemetry (Distributed Tracing + Metrics)

## What problem does OpenTelemetry solve?

In a monolith, when something is slow, you check logs. But in distributed systems, one user request might touch 10+ services. Where did the 3 seconds go?

```
User request → API → Auth service → Database → Cache → Email queue → ...
                              ↑
                    Where is the bottleneck?
```

**OpenTelemetry** (OTel) instruments your code to track the full journey of every request, measure how long each step took, and export that data to visualization tools.

---

## The three pillars of observability

| Signal | What it tells you | Tool |
|---|---|---|
| **Traces** | The journey of a single request through your system | Jaeger, Zipkin |
| **Metrics** | Aggregated numbers over time (requests/sec, error rate, latency) | Prometheus + Grafana |
| **Logs** | Detailed text events (what happened at what time) | Pino + Loki |

OpenTelemetry handles traces and metrics. This project integrates all three.

---

## Core concepts

### Spans

A **span** represents a single unit of work. When a request comes in:

```
HTTP Request span (root span, duration: 250ms)
  └─ Express middleware span (5ms)
  └─ DB query span: SELECT * FROM curriculums (180ms)  ← slow!
  └─ Redis cache write span (3ms)
  └─ JSON serialization span (2ms)
```

Spans form a tree called a **trace**. In Jaeger, you can see this tree visually with timing for each step.

### Trace ID

Every span carries a `traceId`. All spans from the same request share the same `traceId`, which lets you stitch them together in Jaeger.

This project also injects the trace ID into HTTP response headers so the frontend can correlate errors:

```ts
// src/middlewares/tracing.ts
export function traceHeaderMiddleware(req, res, next) {
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  if (traceId) {
    res.setHeader("X-Trace-Id", traceId);
  }
  next();
}
```

---

## How this project uses OpenTelemetry

[`src/instrumentation.ts`](../src/instrumentation.ts):

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";

// Traces → sent to Jaeger
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
});

// Metrics → scraped by Prometheus from /metrics endpoint
export const prometheusExporter = new PrometheusExporter({ preventServerStart: true });

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "techlearn-backend",
  }),
  traceExporter,
  metricReader: prometheusExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },   // too noisy
      "@opentelemetry/instrumentation-dns": { enabled: false },
      "@opentelemetry/instrumentation-http": {
        enabled: true,
        ignoreIncomingRequestHook: (req) =>
          req.url === "/health" || req.url === "/metrics",       // skip internal endpoints
      },
      "@opentelemetry/instrumentation-pg": { enabled: true },   // traces every DB query
      "@opentelemetry/instrumentation-ioredis": { enabled: true }, // traces Redis calls
      "@opentelemetry/instrumentation-pino": { enabled: true },  // adds trace_id to logs
      "@opentelemetry/instrumentation-socket.io": { enabled: true },
    }),
  ],
});

sdk.start();
```

**Key point**: `instrumentation.ts` must be imported FIRST in `server.ts`. This is because auto-instrumentation works by monkey-patching libraries (Express, pg, ioredis, pino) — it must happen before those libraries are first loaded.

The Prometheus metrics are exposed on `/metrics` in [`src/app.ts`](../src/app.ts):

```ts
app.get("/metrics", (_req, res) => {
  prometheusExporter.getMetricsRequestHandler(
    _req as unknown as IncomingMessage,
    res as unknown as ServerResponse
  );
});
```

---

## What you see in Jaeger

When a request hits `GET /api/v1/curriculums`, Jaeger shows:

```
GET /api/v1/curriculums                     [250ms]
├── middleware: express                      [5ms]
├── middleware: requireAuth                  [2ms]
├── pg.query: SELECT * FROM curriculums      [180ms]  ← slowest part
├── ioredis: SET curriculum:list:1           [3ms]
└── express: route handler                   [10ms]
```

You can click any span to see the SQL query, Redis command, or error message.

---

## What Prometheus collects

Prometheus scrapes `/metrics` on a schedule and stores time-series data:

```
http_server_duration_milliseconds{method="GET", route="/api/v1/curriculums", status_code="200"}
db_query_duration_milliseconds{operation="findMany", model="Curriculum"}
redis_cache_hit_total{key_prefix="curriculum"}
redis_cache_miss_total{key_prefix="curriculum"}
```

This project also defines custom metrics in `src/utils/metrics.ts`:

```ts
// Cache hit/miss counters tracked in cache.ts
cacheHitCounter.add(1, { key_prefix: "curriculum" });
cacheMissCounter.add(1, { key_prefix: "curriculum" });
```

---

## Step-by-step practice

**Task 1 — Run Jaeger locally with Docker**

```bash
docker run -d \
  --name jaeger \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 16686:16686 \
  jaegertracing/all-in-one:latest
```

Open `http://localhost:16686` — this is the Jaeger UI.

Start the backend: `npm run dev`

Send a request: `curl http://localhost:4000/api/v1/curriculums`

Go to Jaeger, select "techlearn-backend" from the service dropdown, and click "Find Traces". Click a trace to see the span tree.

**Task 2 — Add a custom span**

```ts
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("techlearn-backend");

async function processData(id: string) {
  // Create a manual span to track this function
  return tracer.startActiveSpan("processData", async (span) => {
    try {
      span.setAttribute("data.id", id);

      const result = await someExpensiveOperation(id);

      span.setAttribute("data.result_size", result.length);
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end(); // always end the span
    }
  });
}
```

After calling this function, find the "processData" span in Jaeger and see your custom attributes.

**Task 3 — Inspect /metrics endpoint**

```bash
curl http://localhost:4000/metrics
```

You'll see Prometheus format output like:
```
# HELP http_server_duration_milliseconds Duration of HTTP server requests.
# TYPE http_server_duration_milliseconds histogram
http_server_duration_milliseconds_bucket{...} 3
http_server_duration_milliseconds_sum{...} 145.2
http_server_duration_milliseconds_count{...} 3
```

---

## Key takeaways

- OpenTelemetry = industry standard for distributed tracing and metrics
- **Traces** show the full journey of one request with timing per step (Jaeger)
- **Metrics** show aggregated numbers over time — request rates, error rates, latency (Prometheus)
- `getNodeAutoInstrumentations()` automatically instruments Express, pg, ioredis, pino — no manual code per function
- instrumentation.ts must be imported first — before any other library
- The trace ID is injected into every log line (via pino instrumentation) — you can jump from a log line to its full trace in Jaeger
- `/metrics` is exposed as a Prometheus scrape endpoint — protect it in production
