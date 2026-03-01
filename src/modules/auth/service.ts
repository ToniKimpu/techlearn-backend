import crypto from "crypto";

import argon2 from "argon2";

import { ROLES } from "../../config/roles.js";
import { prisma } from "../../database/prisma.js";
import { generateAccessToken } from "../../utils/jwt.js";
import { AppError } from "../../utils/errors.js";
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

type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string };
};

async function createSession(
  auth: { id: string; profile: { id: string; fullName: string; userType: string } | null; email: string },
  ip: string | undefined,
  userAgent: string | undefined,
): Promise<AuthResult> {
  if (!auth.profile) throw new AppError(403, "User profile missing");

  const refreshToken = generateRefreshToken();
  const expiresAt = getSessionExpiry(30);

  const session = await prisma.session.create({
    data: {
      authId: auth.id,
      refreshToken,
      expiresAt,
      ipAddress: ip,
      userAgent,
    },
  });

  await cacheSession(auth.id, refreshToken, {
    id: session.id,
    authId: auth.id,
    refreshToken,
    expiresAt: expiresAt.toISOString(),
    auth: {
      id: auth.id,
      profile: {
        id: auth.profile.id,
        fullName: auth.profile.fullName,
        email: auth.email,
        userType: auth.profile.userType,
      },
    },
  });

  const accessToken = generateAccessToken({
    authId: auth.id,
    profileId: auth.profile.id,
    userType: auth.profile.userType,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: auth.profile.id,
      name: auth.profile.fullName,
      email: auth.email,
      role: auth.profile.userType,
    },
  };
}

async function register(
  email: string,
  password: string,
  name: string,
  ip: string | undefined,
  userAgent: string | undefined,
): Promise<AuthResult> {
  const existing = await prisma.authUser.findUnique({ where: { email } });
  if (existing) throw new AppError(400, "Email already exists");

  const passwordHash = await argon2.hash(password);
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
          userType: ROLES.student,
        },
      },
    },
    include: { profile: true },
  });

  const result = await createSession(auth, ip, userAgent);

  queueWelcomeEmail(email, name).catch(() => {});

  return result;
}

async function login(
  auth: { id: string; profile: { id: string; fullName: string; userType: string } | null; email: string },
  ip: string | undefined,
  userAgent: string | undefined,
): Promise<AuthResult> {
  return createSession(auth, ip, userAgent);
}

async function logout(refreshToken: string): Promise<void> {
  const session = await prisma.session.findUnique({ where: { refreshToken } });
  await prisma.session.deleteMany({ where: { refreshToken } });
  if (session) await removeCachedSession(session.authId, refreshToken);
}

async function logoutAll(authId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { authId } });
  await removeAllCachedSessions(authId);
}

async function rotateRefreshToken(token: string): Promise<AuthResult> {
  let sessionData: CachedSession | null = await getCachedSession(token);

  if (!sessionData) {
    const dbSession = await prisma.session.findUnique({
      where: { refreshToken: token },
      include: { auth: { include: { profile: true } } },
    });

    if (!dbSession?.auth?.profile) throw new AppError(401, "Invalid refresh token");

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

  if (!sessionData.auth?.profile) throw new AppError(401, "Invalid refresh token");

  if (new Date(sessionData.expiresAt) < new Date()) {
    await prisma.session.delete({ where: { id: sessionData.id } });
    await removeCachedSession(sessionData.authId, token);
    throw new AppError(401, "Refresh token expired");
  }

  const newRefreshToken = generateRefreshToken();
  const newExpiry = getSessionExpiry(30);

  await prisma.session.update({
    where: { id: sessionData.id },
    data: { refreshToken: newRefreshToken, expiresAt: newExpiry },
  });

  await removeCachedSession(sessionData.authId, token);
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

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: sessionData.auth.profile.id,
      name: sessionData.auth.profile.fullName,
      email: sessionData.auth.profile.email,
      role: sessionData.auth.profile.userType,
    },
  };
}

export const authService = { register, login, logout, logoutAll, rotateRefreshToken };
