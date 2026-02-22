import crypto from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import passport from "passport";

import bcrypt from "bcrypt";

import { prisma } from "../database/prisma.js"
import { generateRefreshToken, getSessionExpiry } from "../utils/session.js";
import { generateAccessToken } from "../utils/jwt";


const router = Router();

// ---------- REGISTER ----------
router.post("/register", async (req: Request, res: Response) => {
  try {
    console.log("[REGISTER] Started registration request");
    const { email, password, name } = req.body;

    // 1️⃣ Validate input
    console.log("[REGISTER] Validating input");
    if (!email || !password || !name) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // 2️⃣ Check existing auth
    console.log("[REGISTER] Checking existing auth for email:", email);
    const existingAuth = await prisma.authUser.findUnique({
      where: { email },
    });
    console.log("[REGISTER] Existing auth check completed");

    if (existingAuth) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // 3️⃣ Hash password
    console.log("[REGISTER] Hashing password");
    const passwordHash = await bcrypt.hash(password, 10);
    console.log("[REGISTER] Password hashed successfully");

    // 4️⃣ Create Auth + Profile (transaction-safe)
    const profileId = crypto.randomUUID();
    console.log("[REGISTER] Creating AuthUser and Profile in database with profileId:", profileId);
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
            user_type: "student", // default role
          },
        },
      },
      include: {
        profile: true,
      },
    });
    console.log("[REGISTER] Database creation successful for auth id:", auth.id);

    if (!auth.profile) {
      throw new Error("Profile creation failed");
    }

    // 5️⃣ Create refresh session
    console.log("[REGISTER] Generating refresh token");
    const refreshToken = generateRefreshToken();
    const expiresAt = getSessionExpiry(30); // 30 days

    console.log("[REGISTER] Saving session to database");
    await prisma.session.create({
      data: {
        authId: auth.id,
        refreshToken,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });
    console.log("[REGISTER] Session saved successfully");

    // 6️⃣ Create access JWT
    console.log("[REGISTER] Generating access token");
    const accessToken = generateAccessToken({
      authId: auth.id,
      profileId: auth.profile!.id,
      userType: auth.profile!.user_type,
    });
    console.log("[REGISTER] Access token generated successfully");

    // 7️⃣ Respond
    console.log("[REGISTER] Sending successful response");
    return res.status(201).json({
      message: "Registered & logged in",
      accessToken,
      refreshToken,
      user: {
        id: auth.profile!.id,
        name: auth.profile!.full_name,
        email: auth.email,
        role: auth.profile!.user_type,
      },
    });
  } catch (err) {
    console.error("[REGISTER] Request failed with error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- LOGIN ----------
router.post("/login", (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("local", async (err: any, auth: any, info: any) => {
    if (err) return next(err);
    if (!auth) {
      return res
        .status(401)
        .json({ message: info?.message || "Invalid credentials" });
    }

    try {
      if (!auth.profile) {
        return res.status(403).json({ message: "User profile missing" });
      }

      // 1️⃣ Create refresh session
      const refreshToken = generateRefreshToken();
      const expiresAt = getSessionExpiry(30); // 30 days

      await prisma.session.create({
        data: {
          authId: auth.id,
          refreshToken,
          expiresAt,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      // 2️⃣ Create access JWT
      const accessToken = generateAccessToken({
        authId: auth.id,
        profileId: auth.profile.id,
        userType: auth.profile.user_type,
      });

      // 3️⃣ Respond
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
    } catch (e) {
      next(e);
    }
  })(req, res, next);
});

// ---------- LOGOUT ----------
router.post("/logout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    await prisma.session.deleteMany({
      where: {
        refreshToken,
      },
    });

    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
});

// ---------- LOGOUT FROM ALL DEVICES ----------
router.post("/logout-all", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.sendStatus(401);

    const auth = req.user as any;

    await prisma.session.deleteMany({
      where: { authId: auth.id },
    });

    req.logout && req.logout((err) => {
      if (err) {
        return res.json({ message: "Logged out from all devices, but error finishing logout", err });
      }
      res.json({ message: "Logged out from all devices" });
    });
    if (!req.logout) {
      res.json({ message: "Logged out from all devices" });
    }
  } catch (err) {
    next(err);
  }
});

// ---------- REFRESH TOKEN ----------
router.post("/refresh-token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    // 1️⃣ Find session
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: {
        auth: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!session || !session.auth || !session.auth.profile) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // 2️⃣ Check expiration
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      return res.status(401).json({ message: "Refresh token expired" });
    }

    // 3️⃣ Rotate refresh token
    const newRefreshToken = generateRefreshToken();
    const newExpiresAt = getSessionExpiry(30);

    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
      },
    });

    // 4️⃣ Generate new access token
    const accessToken = generateAccessToken({
      authId: session.auth.id,
      profileId: session.auth.profile.id,
      userType: session.auth.profile.user_type,
    });

    // 5️⃣ Respond
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
    next(err);
  }
});

export default router;
