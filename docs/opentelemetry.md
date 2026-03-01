# OpenTelemetry Observability

This document covers the full observability setup: distributed tracing, Prometheus metrics, log correlation, and local development with Jaeger.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File Reference](#file-reference)
4. [Auto-Instrumented Libraries](#auto-instrumented-libraries)
5. [Custom Metrics](#custom-metrics)
6. [Span Enrichment](#span-enrichment)
7. [Log Correlation](#log-correlation)
8. [Environment Variables](#environment-variables)
9. [Local Development with Jaeger](#local-development-with-jaeger)
10. [Prometheus Metrics Endpoint](#prometheus-metrics-endpoint)
11. [Disabling OTel](#disabling-otel)
12. [Adding Custom Metrics](#adding-custom-metrics)
13. [Adding Custom Spans](#adding-custom-spans)
14. [ESM Patching — Why Import Order Matters](#esm-patching--why-import-order-matters)

---

## Overview

The stack uses the [OpenTelemetry Node.js SDK](https://opentelemetry.io/docs/languages/js/) with three pillars:

| Pillar | How | Where |
|---|---|---|
| **Traces** | OTel SDK → OTLP HTTP → Jaeger | `src/instrumentation.ts` |
| **Metrics** | OTel SDK → Prometheus exporter | `GET /metrics` |
| **Logs** | pino + OTel pino instrumentation | Every log line gets `trace_id` + `span_id` |

Every HTTP request automatically gets a full trace that spans from the HTTP layer through Express routing, into every Prisma (pg) query and Redis call, and back out — with zero manual span creation needed for basic coverage.

---

## Architecture

```
HTTP Request
    │
    ▼
OTel HTTP instrumentation          ← auto-span: "HTTP POST /api/v1/auth/login"
    │
    ▼
Express router                     ← auto-span: "router - /api/v1"
    │
    ├─ traceHeaderMiddleware        ← injects X-Trace-Id response header
    ├─ requireAuth                  ← JWT validation
    ├─ userSpanMiddleware           ← attaches user.id + user.type to active span
    │
    ▼
Service layer
    ├─ Prisma → pg                  ← auto-span: "pg.query SELECT ..."
    └─ Redis (ioredis)              ← auto-span: "redis GET curriculum:..."
    │
    ▼
Response
    │
    ├─ Traces   ──► OTLP HTTP ──► Jaeger  (view at localhost:16686)
    ├─ Metrics  ──► Prometheus exporter ──► GET /metrics
    └─ Logs     ──► pino (stdout) with trace_id + span_id injected
```

---

## File Reference

| File | Role |
|---|---|
| `src/instrumentation.ts` | SDK init — must be the first import in `server.ts` |
| `src/utils/metrics.ts` | Custom metric instruments (counters) |
| `src/middlewares/tracing.ts` | Span enrichment middlewares |
| `src/utils/cache.ts` | Increments cache hit/miss counters on every Redis read |

### `src/instrumentation.ts`

Initialises the `NodeSDK` with:
- A **trace exporter** sending OTLP HTTP to Jaeger (or any OTLP backend)
- A **Prometheus metric reader** that serves data via Express's `/metrics` route
- All auto-instrumentations (with noisy ones disabled)

```ts
// Exported for use in other modules
export const prometheusExporter: PrometheusExporter;
export const sdk: NodeSDK | null;   // null when OTEL_SDK_DISABLED=true
```

### `src/utils/metrics.ts`

Custom business metric counters built on the OTel Metrics API:

```ts
export const cacheHitCounter:    Counter;  // techlearn_cache_hits_total
export const cacheMissCounter:   Counter;  // techlearn_cache_misses_total
export const authFailureCounter: Counter;  // techlearn_auth_failures_total
export const emailJobCounter:    Counter;  // techlearn_email_jobs_total
```

### `src/middlewares/tracing.ts`

```ts
// Applied globally in app.ts — adds X-Trace-Id response header
export const traceHeaderMiddleware: RequestHandler;

// Applied after requireAuth — adds user.id and user.type to the active span
export const userSpanMiddleware: RequestHandler;
```

---

## Auto-Instrumented Libraries

These libraries produce spans automatically with no code changes required.

| Library | Spans produced | Enabled |
|---|---|---|
| `http` (Node built-in) | One span per incoming HTTP request | ✅ |
| `express` | Router and middleware spans | ✅ |
| `pg` | One span per SQL query (Prisma uses pg under the hood) | ✅ |
| `ioredis` | One span per Redis command (GET, SET, DEL, SCAN…) | ✅ |
| `pino` | Injects `trace_id` + `span_id` into every log line | ✅ |
| `socket.io` | Spans for WS connection/event lifecycle | ✅ |
| `fs` | File system spans | ❌ too noisy |
| `dns` | DNS resolution spans | ❌ no value |
| `net` | TCP socket spans | ❌ no value |

Requests to `/health` and `/metrics` are excluded from traces to avoid clutter.

---

## Custom Metrics

Custom counters live in `src/utils/metrics.ts` and are scraped at `/metrics`.

### Cache hit rate

`src/utils/cache.ts` increments these on every `getCache()` call:

```
techlearn_cache_hits_total{key_prefix="curriculum"}   42
techlearn_cache_misses_total{key_prefix="curriculum"}  3
```

The `key_prefix` attribute is the first segment of the Redis key (e.g. `curriculum` from `curriculum:1`). Use this to compute a per-entity hit rate in Grafana:

```promql
rate(techlearn_cache_hits_total[5m])
/
(rate(techlearn_cache_hits_total[5m]) + rate(techlearn_cache_misses_total[5m]))
```

### Auth failures

```ts
import { authFailureCounter } from "../utils/metrics.js";

authFailureCounter.add(1, { reason: "invalid_credentials" });
authFailureCounter.add(1, { reason: "account_inactive" });
```

### Email jobs

```ts
import { emailJobCounter } from "../utils/metrics.js";

emailJobCounter.add(1, { type: "welcome" });
```

---

## Span Enrichment

### X-Trace-Id response header

Every response (except `/health` and `/metrics`) carries an `X-Trace-Id` header:

```
X-Trace-Id: 86c2398e297445f952c2abfac90bed65
```

Use this in your frontend or API client to look up the exact trace in Jaeger when debugging a specific request.

### User context on authenticated spans

Apply `userSpanMiddleware` on any route that runs after `requireAuth`:

```ts
import { userSpanMiddleware } from "../../middlewares/tracing.js";

router.get(
  "/profile",
  requireAuth,
  userSpanMiddleware,   // ← adds user.id and user.type to the span
  handler
);
```

This attaches:
```
user.id   = "clxyz..."
user.type = "teacher"
```

to the active span, making it possible to filter all traces for a specific user in Jaeger's search UI.

---

## Log Correlation

The `@opentelemetry/instrumentation-pino` auto-instrumentation injects `trace_id`, `span_id`, and `trace_flags` into every pino log line that is emitted while inside an active span.

**Development output (pino-pretty):**
```
INFO [10:01:23.441] Unhandled error
    err: { message: "…" }
    trace_id: 86c2398e297445f952c2abfac90bed65
    span_id:  3a7f2c1e9d5b4a08
    trace_flags: 1
```

**Production output (JSON, ready for log aggregators like Loki/Elasticsearch):**
```json
{
  "level": 40,
  "time": 1709294483441,
  "msg": "Unhandled error",
  "trace_id": "86c2398e297445f952c2abfac90bed65",
  "span_id": "3a7f2c1e9d5b4a08",
  "trace_flags": "01"
}
```

In Grafana, you can pivot from a log line directly to the corresponding trace by clicking the `trace_id` value (requires Loki + Tempo correlation configured).

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OTEL_SDK_DISABLED` | `false` | Set to `true` to disable all tracing and metrics |
| `OTEL_SERVICE_NAME` | `techlearn-backend` | Service name shown in Jaeger and Prometheus labels |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318/v1/traces` | OTLP HTTP endpoint for trace export |
| `NODE_ENV` | `development` | Sets `deployment.environment` resource attribute |

All three are optional — the SDK runs with sensible defaults if they are absent.

---

## Local Development with Jaeger

The `docker-compose.yml` includes a [Jaeger all-in-one](https://www.jaegertracing.io/docs/latest/getting-started/) container that accepts OTLP traces and provides a search UI.

### Start Jaeger only

```bash
docker compose up jaeger
```

| URL | Purpose |
|---|---|
| `http://localhost:16686` | Jaeger search UI |
| `http://localhost:4318` | OTLP HTTP receiver (app sends traces here) |

### Start the full stack

```bash
docker compose up
```

The `app` service automatically sets `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318/v1/traces` so traces flow to Jaeger without any extra configuration.

### Finding a trace in Jaeger

1. Make any API request (e.g. `POST /api/v1/auth/login`)
2. Copy the `X-Trace-Id` value from the response header
3. Open `http://localhost:16686`
4. Select service **techlearn-backend**, paste the trace ID, click **Find Traces**

You will see the full waterfall: HTTP → Express middleware → pg query → Redis command.

---

## Prometheus Metrics Endpoint

```
GET /metrics
Content-Type: text/plain; version=0.0.4
```

Returns all auto-instrumented and custom metrics in Prometheus text format.

**Sample output:**
```
# HELP http_server_duration_ms Duration of HTTP server requests
# TYPE http_server_duration_ms histogram
http_server_duration_ms_bucket{le="50",...}  18
...

# HELP techlearn_cache_hits_total Number of Redis cache hits
# TYPE techlearn_cache_hits_total counter
techlearn_cache_hits_total{key_prefix="curriculum"} 42

# HELP techlearn_cache_misses_total Number of Redis cache misses
# TYPE techlearn_cache_misses_total counter
techlearn_cache_misses_total{key_prefix="curriculum"} 3
```

> **Security note:** In production, restrict access to `/metrics` at the reverse-proxy or load-balancer level (e.g. allow only your Prometheus scraper's IP). Do not expose it publicly.

---

## Disabling OTel

### In environment files

```env
OTEL_SDK_DISABLED=true
```

This skips `sdk.start()` entirely. The Prometheus exporter still initialises (so `GET /metrics` works) but returns empty data.

### In tests

The test suite does not set `OTEL_SDK_DISABLED`, but the OTel SDK silently drops all spans and metrics when no backend is reachable — tests are unaffected. The `X-Trace-Id` header will still appear in test responses (the span context is valid, just not exported anywhere).

---

## Adding Custom Metrics

Import an existing counter from `src/utils/metrics.ts`, or create a new instrument there.

```ts
// src/utils/metrics.ts
export const myNewCounter = meter.createCounter("techlearn_my_event_total", {
  description: "Number of times my event happened",
});
```

Then use it in any service or middleware:

```ts
import { myNewCounter } from "../../utils/metrics.js";

myNewCounter.add(1, { source: "api" });
```

Available instrument types:

| Type | Factory | Use for |
|---|---|---|
| Counter | `meter.createCounter()` | Monotonically increasing values (requests, errors) |
| UpDownCounter | `meter.createUpDownCounter()` | Values that can decrease (active connections, queue depth) |
| Histogram | `meter.createHistogram()` | Duration, size, latency distributions |
| Observable Gauge | `meter.createObservableGauge()` | Sampled values read on demand (memory, CPU) |

---

## Adding Custom Spans

For operations not covered by auto-instrumentation, create spans manually:

```ts
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("techlearn-backend");

async function myOperation() {
  return tracer.startActiveSpan("my-operation", async (span) => {
    try {
      span.setAttribute("operation.input", "value");

      const result = await doWork();

      span.setAttribute("operation.result_count", result.length);
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end(); // always end the span
    }
  });
}
```

---

## ESM Patching — Why Import Order Matters

OpenTelemetry patches Node.js modules by wrapping their exports at load time. For CommonJS this is straightforward — `require()` is synchronous and can be intercepted. For ES Modules the picture is more nuanced.

**In development (`tsx watch`):** `instrumentation.ts` is the first `import` statement in `server.ts`. TypeScript/tsx evaluates imports depth-first in order, so `instrumentation.ts` runs and registers all patches before `express`, `pg`, and `ioredis` are used.

**In production (`node dist/server.js`):** The `--import` flag pre-loads the instrumentation module before the Node.js module graph is resolved, guaranteeing patches are applied even for ESM:

```json
"start": "node --import ./dist/instrumentation.js dist/server.js"
```

If you ever remove the `--import` flag from the start script, HTTP and Express tracing will still work (they patch at the socket level), but pg and Redis spans may be missing.
