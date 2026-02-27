import type { NextFunction, Request, Response } from "express";

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser || !roles.includes(req.authUser.userType)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}
