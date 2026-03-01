import compression from "compression";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { AppError } from "./utils/errors.js";
import helmet from "helmet";
import type { IncomingMessage, ServerResponse } from "http";
import pinoHttp from "pino-http";

import { redis } from "./config/redis.js";
import { prisma } from "./database/prisma.js";
import { globalLimiter } from "./middlewares/rateLimiter.js";
import { traceHeaderMiddleware } from "./middlewares/tracing.js";
import { logger } from "./utils/logger.js";
import { prometheusExporter } from "./instrumentation.js";
import passport from "./config/passport.js";
import authRoutes from "./modules/auth/routes.js";
import chapterRoutes from "./modules/chapters/routes.js";
import curriculumRoutes from "./modules/curriculums/routes.js";
import gradeRoutes from "./modules/grades/routes.js";
import subjectRoutes from "./modules/subjects/routes.js";
import emailRoutes from "./modules/email/routes.js";
import uploadRoutes from "./modules/upload/routes.js";

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

export const CORS_ORIGIN = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((pinoHttp as any)({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) =>
      req.url === "/health" || req.url === "/metrics",
  },
}));
// Inject X-Trace-Id response header (client-side trace correlation)
app.use(traceHeaderMiddleware);
app.use(passport.initialize());
app.use(globalLimiter);

app.use("/api/v1", authRoutes);
app.use("/api/v1", curriculumRoutes);
app.use("/api/v1", gradeRoutes);
app.use("/api/v1", subjectRoutes);
app.use("/api/v1", chapterRoutes);
app.use("/api/v1", uploadRoutes);
app.use("/api/v1", emailRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.send("API running");
});

// Prometheus metrics — scrape this with Prometheus or Grafana Agent.
// In production, protect this endpoint with a reverse-proxy allow-list or
// a scrape token (e.g. Bearer check) so it is not publicly accessible.
app.get("/metrics", (_req: Request, res: Response) => {
  prometheusExporter.getMetricsRequestHandler(
    _req as unknown as IncomingMessage,
    res as unknown as ServerResponse
  );
});

app.get("/health", async (_req: Request, res: Response) => {
  const checks: Record<string, string> = { db: "ok", redis: "ok" };

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

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  logger.error({ err }, "Unhandled error");
  return res.status(500).json({ error: "Internal Server Error" });
});

export default app;
