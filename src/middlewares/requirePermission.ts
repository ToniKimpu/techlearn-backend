import type { NextFunction, Request, Response } from "express";

import { type Permission, PERMISSIONS } from "../config/roles.js";

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userType = req.authUser?.userType;
    const allowed = PERMISSIONS[permission] as readonly string[];
    if (!userType || !allowed.includes(userType)) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }
    return next();
  };
}
