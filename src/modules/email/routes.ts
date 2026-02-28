import { Router, type Request, type Response } from "express";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { emailQueue } from "./producer.js";

const router = Router();

router.get(
  "/email/health",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response) => {
    if (!emailQueue) {
      return res.json({
        status: "disabled",
        message: "Email queue not available (Redis not connected)",
      });
    }

    try {
      const counts = await emailQueue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      );

      return res.json({
        status: "active",
        queue: "email",
        jobs: counts,
      });
    } catch {
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch queue status",
      });
    }
  }
);

export default router;
