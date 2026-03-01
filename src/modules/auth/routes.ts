import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import passport from "passport";

import { authLimiter } from "../../middlewares/rateLimiter.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { validate } from "../../middlewares/validate.js";
import { loginBody, logoutBody, refreshTokenBody, registerBody } from "./schemas.js";
import { authService } from "./service.js";

const router = Router();

router.post(
  "/auth/register",
  authLimiter,
  validate({ body: registerBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, name } = req.body;
      const result = await authService.register(
        email,
        password,
        name,
        req.ip,
        req.headers["user-agent"]
      );
      return res.status(201).json({ message: "Registered & logged in", ...result });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/auth/login",
  authLimiter,
  validate({ body: loginBody }),
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", async (err: Error, auth: any, info: { message?: string }) => {
      if (err) return next(err);
      if (!auth) return res.status(401).json({ message: info?.message || "Invalid credentials" });

      try {
        const result = await authService.login(auth, req.ip, req.headers["user-agent"]);
        return res.json({ message: "Login successful", ...result });
      } catch (error) {
        return next(error);
      }
    })(req, res, next);
  }
);

router.post(
  "/auth/logout",
  validate({ body: logoutBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.logout(req.body.refreshToken);
      return res.json({ message: "Logged out successfully" });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/auth/logout-all",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.logoutAll(req.authUser!.authId);
      return res.json({ message: "Logged out from all devices" });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/auth/refresh-token",
  validate({ body: refreshTokenBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.rotateRefreshToken(req.body.refreshToken);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
