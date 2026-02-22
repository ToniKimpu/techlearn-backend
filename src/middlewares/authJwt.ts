import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/verifyAccessToken.js";


export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing access token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    (req as any).user = verifyAccessToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ message: "Access token expired or invalid" });
  }
}
