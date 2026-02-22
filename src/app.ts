import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import session from "express-session";

import passport from "./config/passport.js";
import authRoutes from "./modules/auth/routes.js";
import movieRoutes from "./modules/movies/routes.js";
import curriculumRoutes from "./modules/curriculums/routes.js";

dotenv.config();

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", authRoutes);
app.use("/", movieRoutes);
app.use("/", curriculumRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.send("API running");
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack || err);
  res.status(500).json({ error: "Internal Server Error" });
});

export default app;
