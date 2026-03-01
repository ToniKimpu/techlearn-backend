/**
 * OpenTelemetry SDK initialization.
 *
 * This module MUST be imported before all others in the entry point (server.ts)
 * so that auto-instrumentations can patch http, express, pg, ioredis, and pino
 * before those modules are first used.
 *
 * For production, use the `--import` flag instead:
 *   node --import ./dist/instrumentation.js dist/server.js
 * This guarantees patching happens before the module graph is resolved.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const enabled = process.env.OTEL_SDK_DISABLED !== "true";

// Service resource attributes — appear in every trace and metric
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "techlearn-backend",
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "1.0.0",
  "deployment.environment": process.env.NODE_ENV ?? "development",
});

// Prometheus exporter — serves metrics via Express /metrics route (not a standalone server)
export const prometheusExporter = new PrometheusExporter({
  preventServerStart: true,
});

let sdk: NodeSDK | null = null;

if (enabled) {
  const traceExporter = new OTLPTraceExporter({
    // Default: Jaeger all-in-one OTLP HTTP endpoint (override via env)
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy low-value instrumentations
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },

        // HTTP: skip health/metrics endpoints to keep traces clean
        "@opentelemetry/instrumentation-http": {
          enabled: true,
          ignoreIncomingRequestHook: (req) => req.url === "/health" || req.url === "/metrics",
        },

        // pg auto-instrumentation traces every Prisma query
        "@opentelemetry/instrumentation-pg": { enabled: true },

        // ioredis auto-instrumentation traces Redis calls
        "@opentelemetry/instrumentation-ioredis": { enabled: true },

        // pino auto-instrumentation injects trace_id + span_id into every log line
        "@opentelemetry/instrumentation-pino": { enabled: true },

        // socket.io auto-instrumentation traces WS events
        "@opentelemetry/instrumentation-socket.io": { enabled: true },
      }),
    ],
  });

  sdk.start();
}

// Exported for graceful shutdown in server.ts
export { sdk };
