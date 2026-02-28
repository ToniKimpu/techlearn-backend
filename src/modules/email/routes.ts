import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { emailService } from "./service.js";

const router = Router();

router.get("/email/health", requireAuth, requireRole("admin"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await emailService.getQueueHealth();
    return res.json(health);
  } catch {
    return next(new Error("Failed to fetch queue status"));
  }
});

export default router;
