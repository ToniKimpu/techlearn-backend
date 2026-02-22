import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing access token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    req.authUser = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ message: "Access token expired or invalid" });
  }
}
