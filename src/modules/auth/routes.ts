import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import passport from "passport";

import bcrypt from "bcrypt";
import { prisma } from "../../database/prisma.js";
import { generateAccessToken } from "../../utils/jwt.js";
import { generateRefreshToken, getSessionExpiry } from "../../utils/session.js";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: "Missing fields" });
    }

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
            full_name: name,
            email,
            gender: "unspecified",
            user_type: "student",
          },
        },
      },
      include: { profile: true },
    });

    if (!auth.profile) {
      throw new Error("Profile creation failed");
    }

    const refreshToken = generateRefreshToken();
    await prisma.session.create({
      data: {
        authId: auth.id,
        refreshToken,
        expiresAt: getSessionExpiry(30),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    const accessToken = generateAccessToken({
      authId: auth.id,
      profileId: auth.profile.id,
      userType: auth.profile.user_type,
    });

    return res.status(201).json({
      message: "Registered & logged in",
      accessToken,
      refreshToken,
      user: {
        id: auth.profile.id,
        name: auth.profile.full_name,
        email: auth.email,
        role: auth.profile.user_type,
      },
    });
  } catch (err) {
    console.error("[REGISTER]", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", (req: Request, res: Response, next: NextFunction) => {
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
      await prisma.session.create({
        data: {
          authId: auth.id,
          refreshToken,
          expiresAt: getSessionExpiry(30),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      const accessToken = generateAccessToken({
        authId: auth.id,
        profileId: auth.profile.id,
        userType: auth.profile.user_type,
      });

      return res.json({
        message: "Login successful",
        accessToken,
        refreshToken,
        user: {
          id: auth.profile.id,
          name: auth.profile.full_name,
          email: auth.email,
          role: auth.profile.user_type,
        },
      });
    } catch (error) {
      return next(error);
    }
  })(req, res, next);
});

router.post("/logout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    await prisma.session.deleteMany({ where: { refreshToken } });
    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    return next(err);
  }
});

router.post("/logout-all", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.authUser?.authId) {
      return res.sendStatus(401);
    }

    await prisma.session.deleteMany({
      where: { authId: req.authUser.authId },
    });

    return res.json({ message: "Logged out from all devices" });
  } catch (err) {
    return next(err);
  }
});

router.post("/refresh-token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { auth: { include: { profile: true } } },
    });

    if (!session?.auth?.profile) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      return res.status(401).json({ message: "Refresh token expired" });
    }

    const newRefreshToken = generateRefreshToken();
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: newRefreshToken,
        expiresAt: getSessionExpiry(30),
      },
    });

    const accessToken = generateAccessToken({
      authId: session.auth.id,
      profileId: session.auth.profile.id,
      userType: session.auth.profile.user_type,
    });

    return res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: session.auth.profile.id,
        name: session.auth.profile.full_name,
        email: session.auth.email,
        role: session.auth.profile.user_type,
      },
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
