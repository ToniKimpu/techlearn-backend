import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import passport from "passport";

import bcrypt from "bcrypt";
import { prisma } from "../../database/prisma.js";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { validate } from "../../middlewares/validate.js";
import { generateAccessToken } from "../../utils/jwt.js";
import {
  cacheSession,
  type CachedSession,
  generateRefreshToken,
  getCachedSession,
  getSessionExpiry,
  removeAllCachedSessions,
  removeCachedSession,
} from "../../utils/session.js";
import { queueWelcomeEmail } from "../email/producer.js";
import { loginBody, logoutBody, refreshTokenBody, registerBody } from "./schemas.js";

const router = Router();

router.post("/auth/register", authLimiter, validate({ body: registerBody }), async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    const existingAuth = await prisma.authUser.findUnique({ where: { email } });
    if (existingAuth) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const profileId = crypto.randomUUID();

    const auth = await prisma.authUser.create({
      data: {
        email,
        passwordHash,
        isActive: true,
        profile: {
          create: {
            id: profileId,
            fullName: name,
            email,
            gender: "unspecified",
            userType: "student",
          },
        },
      },
      include: { profile: true },
    });

    if (!auth.profile) {
      throw new Error("Profile creation failed");
    }

    const refreshToken = generateRefreshToken();
    const expiresAt = getSessionExpiry(30);
    const session = await prisma.session.create({
      data: {
        authId: auth.id,
        refreshToken,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    await cacheSession(auth.id, refreshToken, {
      id: session.id,
      authId: auth.id,
      refreshToken,
      expiresAt: expiresAt.toISOString(),
      auth: {
        id: auth.id,
        profile: { id: auth.profile.id, fullName: auth.profile.fullName, email: auth.email, userType: auth.profile.userType },
      },
    });

    const accessToken = generateAccessToken({
      authId: auth.id,
      profileId: auth.profile.id,
      userType: auth.profile.userType,
    });

    queueWelcomeEmail(email, name).catch(() => {});

    return res.status(201).json({
      message: "Registered & logged in",
      accessToken,
      refreshToken,
      user: {
        id: auth.profile.id,
        name: auth.profile.fullName,
        email: auth.email,
        role: auth.profile.userType,
      },
    });
  } catch (err) {
    console.error("[REGISTER]", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/auth/login", authLimiter, validate({ body: loginBody }), (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("local", async (err: Error, auth: any, info: { message?: string }) => {
    if (err) return next(err);
    if (!auth) {
      return res.status(401).json({ message: info?.message || "Invalid credentials" });
    }

    try {
      if (!auth.profile) {
        return res.status(403).json({ message: "User profile missing" });
      }

      const refreshToken = generateRefreshToken();
      const expiresAt = getSessionExpiry(30);
      const session = await prisma.session.create({
        data: {
          authId: auth.id,
          refreshToken,
          expiresAt,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      await cacheSession(auth.id, refreshToken, {
        id: session.id,
        authId: auth.id,
        refreshToken,
        expiresAt: expiresAt.toISOString(),
        auth: {
          id: auth.id,
          profile: { id: auth.profile.id, fullName: auth.profile.fullName, email: auth.email, userType: auth.profile.userType },
        },
      });

      const accessToken = generateAccessToken({
        authId: auth.id,
        profileId: auth.profile.id,
        userType: auth.profile.userType,
      });

      return res.json({
        message: "Login successful",
        accessToken,
        refreshToken,
        user: {
          id: auth.profile.id,
          name: auth.profile.fullName,
          email: auth.email,
          role: auth.profile.userType,
        },
      });
    } catch (error) {
      return next(error);
    }
  })(req, res, next);
});

router.post("/auth/logout", validate({ body: logoutBody }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    const session = await prisma.session.findUnique({ where: { refreshToken } });
    await prisma.session.deleteMany({ where: { refreshToken } });
    if (session) await removeCachedSession(session.authId, refreshToken);

    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    return next(err);
  }
});

router.post("/auth/logout-all", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authId = req.authUser!.authId;
    await prisma.session.deleteMany({ where: { authId } });
    await removeAllCachedSessions(authId);

    return res.json({ message: "Logged out from all devices" });
  } catch (err) {
    return next(err);
  }
});

router.post("/auth/refresh-token", validate({ body: refreshTokenBody }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    // Try Redis first, fall back to DB
    let sessionData: CachedSession | null = await getCachedSession(refreshToken);

    if (!sessionData) {
      const dbSession = await prisma.session.findUnique({
        where: { refreshToken },
        include: { auth: { include: { profile: true } } },
      });

      if (!dbSession?.auth?.profile) {
        return res.status(401).json({ message: "Invalid refresh token" });
      }

      sessionData = {
        id: dbSession.id,
        authId: dbSession.authId,
        refreshToken: dbSession.refreshToken,
        expiresAt: dbSession.expiresAt.toISOString(),
        auth: {
          id: dbSession.auth.id,
          profile: {
            id: dbSession.auth.profile.id,
            fullName: dbSession.auth.profile.fullName,
            email: dbSession.auth.email,
            userType: dbSession.auth.profile.userType,
          },
        },
      };
    }

    if (!sessionData.auth?.profile) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    if (new Date(sessionData.expiresAt) < new Date()) {
      await prisma.session.delete({ where: { id: sessionData.id } });
      await removeCachedSession(sessionData.authId, refreshToken);
      return res.status(401).json({ message: "Refresh token expired" });
    }

    // Rotate token
    const newRefreshToken = generateRefreshToken();
    const newExpiry = getSessionExpiry(30);
    await prisma.session.update({
      where: { id: sessionData.id },
      data: { refreshToken: newRefreshToken, expiresAt: newExpiry },
    });

    // Remove old cache, set new
    await removeCachedSession(sessionData.authId, refreshToken);
    await cacheSession(sessionData.authId, newRefreshToken, {
      ...sessionData,
      refreshToken: newRefreshToken,
      expiresAt: newExpiry.toISOString(),
    });

    const accessToken = generateAccessToken({
      authId: sessionData.auth.id,
      profileId: sessionData.auth.profile.id,
      userType: sessionData.auth.profile.userType,
    });

    return res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: sessionData.auth.profile.id,
        name: sessionData.auth.profile.fullName,
        email: sessionData.auth.profile.email,
        role: sessionData.auth.profile.userType,
      },
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
