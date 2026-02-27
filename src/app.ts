import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";

import passport from "./config/passport.js";
import authRoutes from "./modules/auth/routes.js";
import curriculumRoutes from "./modules/curriculums/routes.js";
import uploadRoutes from "./modules/upload/routes.js";

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

export const CORS_ORIGIN = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(helmet());
app.use(express.json());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

app.use(passport.initialize());

app.use("/auth", authRoutes);
app.use("/", curriculumRoutes);
app.use("/", uploadRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.send("API running");
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack || err);
  res.status(500).json({ error: "Internal Server Error" });
});

export default app;
