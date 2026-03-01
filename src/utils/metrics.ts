/**
 * Custom business metrics exposed via the Prometheus /metrics endpoint.
 *
 * These complement the auto-instrumented metrics (http.server.request.duration,
 * http.server.active_requests, db query durations, etc.).
 *
 * Usage example:
 *   import { cacheHitCounter } from "./metrics.js";
 *   cacheHitCounter.add(1, { key_prefix: "curriculum" });
 */
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("techlearn-backend");

// ── Cache ─────────────────────────────────────────────────────────────────────

export const cacheHitCounter = meter.createCounter(
  "techlearn_cache_hits_total",
  { description: "Number of Redis cache hits" }
);

export const cacheMissCounter = meter.createCounter(
  "techlearn_cache_misses_total",
  { description: "Number of Redis cache misses" }
);

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Increment when login, token refresh, or registration fails.
 * Attributes: { reason: "invalid_credentials" | "account_inactive" | ... }
 */
export const authFailureCounter = meter.createCounter(
  "techlearn_auth_failures_total",
  { description: "Number of authentication failures" }
);

// ── Email queue ───────────────────────────────────────────────────────────────

export const emailJobCounter = meter.createCounter(
  "techlearn_email_jobs_total",
  { description: "Number of email jobs enqueued" }
);
