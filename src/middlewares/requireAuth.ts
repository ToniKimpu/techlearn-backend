// import type { NextFunction, Request, Response } from "express";
// import { verifyAccessToken } from "../utils/jwt.js";

// export function requireAuth(req: Request, res: Response, next: NextFunction) {
//   const authHeader = req.headers.authorization;

//   if (!authHeader?.startsWith("Bearer ")) {
//     return res.status(401).json({ message: "Missing access token" });
//   }

//   const token = authHeader.split(" ")[1];

//   try {
//     req.authUser = verifyAccessToken(token);
//     next();
//   } catch {
//     return res.status(401).json({ message: "Access token expired or invalid" });
//   }
// }

import type { NextFunction, Request, Response } from "express";
import { prisma } from "../database/prisma.js";
import { getCache, setCache } from "../utils/cache.js";
import { verifyAccessToken } from "../utils/jwt.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing access token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    req.authUser = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ message: "Access token expired or invalid" });
  }

  // Check if the user's account has been deactivated
  const { profileId } = req.authUser;
  const cacheKey = `profile:deactivated:${profileId}`;

  const cached = await getCache<boolean>(cacheKey);
  const isDeactivated = cached.hit
    ? cached.data
    : await prisma.profile
        .findUnique({ where: { id: profileId }, select: { isDeactivated: true } })
        .then((p) => p?.isDeactivated ?? false);

  if (!cached.hit) {
    await setCache(cacheKey, isDeactivated, 300); // cache for 5 minutes
  }

  if (isDeactivated) {
    return res.status(403).json({ message: "Account is deactivated" });
  }

  return next();
}
