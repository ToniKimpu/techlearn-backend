/**
 * Span enrichment middleware.
 *
 * traceHeaderMiddleware  — runs globally; injects X-Trace-Id response header
 *                          so clients can correlate requests with backend traces.
 *
 * userSpanMiddleware     — runs after requireAuth; attaches the authenticated
 *                          user's ID and role to the active span for filtering
 *                          traces by user in Jaeger / Grafana Tempo.
 */
import { trace } from "@opentelemetry/api";
import type { RequestHandler } from "express";

export const traceHeaderMiddleware: RequestHandler = (_req, res, next) => {
  const span = trace.getActiveSpan();
  if (span?.isRecording()) {
    res.setHeader("X-Trace-Id", span.spanContext().traceId);
  }
  next();
};

export const userSpanMiddleware: RequestHandler = (req, _res, next) => {
  const span = trace.getActiveSpan();
  if (span?.isRecording() && req.authUser) {
    span.setAttribute("user.id", req.authUser.authId);
    span.setAttribute("user.type", req.authUser.userType);
  }
  next();
};
