import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import cors from "cors";
import dotenv from "dotenv";

import "./auth/passport.js";
import authRoutes from "./routes/auth.js";
import movieRoutes from "./routes/movies.js";

// Load environment variables
dotenv.config();

// ---------- BigInt JSON handling ----------
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// ---------- Express app ----------
const app = express();

// ---------- MIDDLEWARE ----------
app.use(express.json());

// CORS (adjust origin as needed)
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// ---------- SESSION SETUP ----------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

// ---------- PASSPORT INIT ----------
app.use(passport.initialize());
app.use(passport.session());

// ---------- ROUTES ----------
app.use("/auth", authRoutes);
app.use("/", movieRoutes);

// Health check
app.get("/", (_req: Request, res: Response) => {
  res.send("API running");
});

// ---------- ERROR HANDLER ----------
app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack || err);
    res.status(500).json({ error: "Internal Server Error" });
  }
);

export default app;