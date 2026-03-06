import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import passport from "passport";

import { authLimiter } from "../../middlewares/rateLimiter.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { validate } from "../../middlewares/validate.js";
import { AppError } from "../../utils/errors.js";
import { loginBody, registerBody } from "./schemas.js";
import { authService } from "./service.js";

const router = Router();

const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function setAuthCookies(res: Response, refreshToken: string) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
  res.cookie("is_authenticated", "true", {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/",
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/api/v1/auth",
  });
  res.clearCookie("is_authenticated", {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/",
  });
}

router.post(
  "/auth/register",
  authLimiter,
  validate({ body: registerBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, name } = req.body;
      const { accessToken, refreshToken, user } = await authService.register(
        email,
        password,
        name,
        req.ip,
        req.headers["user-agent"]
      );
      setAuthCookies(res, refreshToken);
      return res.status(201).json({ message: "Registered & logged in", accessToken, user });
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
        const { accessToken, refreshToken, user } = await authService.login(
          auth,
          req.ip,
          req.headers["user-agent"]
        );
        setAuthCookies(res, refreshToken);
        return res.json({ message: "Login successful", accessToken, user });
      } catch (error) {
        return next(error);
      }
    })(req, res, next);
  }
);

router.post("/auth/logout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refreshToken as string | undefined;
    if (refreshToken) await authService.logout(refreshToken);
    clearAuthCookies(res);
    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    return next(err);
  }
});

router.post(
  "/auth/logout-all",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.logoutAll(req.authUser!.authId);
      clearAuthCookies(res);
      return res.json({ message: "Logged out from all devices" });
    } catch (err) {
      return next(err);
    }
  }
);

router.post("/auth/refresh-token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refreshToken as string | undefined;
    if (!refreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "Refresh token missing" });
    }
    const {
      accessToken,
      refreshToken: newRefreshToken,
      user,
    } = await authService.rotateRefreshToken(refreshToken);
    setAuthCookies(res, newRefreshToken);
    return res.json({ accessToken, user });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 401) {
      clearAuthCookies(res);
      return res.status(401).json({ message: err.message });
    }
    return next(err);
  }
});

export default router;
