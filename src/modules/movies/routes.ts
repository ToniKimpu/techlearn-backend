import { Router } from "express";

import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

router.get("/movies", requireAuth, (_req, res) => {
  return res.status(501).json({
    message: "Movies module is not available because no Movie model exists in Prisma schema.",
  });
});

export default router;
