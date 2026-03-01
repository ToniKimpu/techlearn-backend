import { Router } from "express";
import type { z } from "zod";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requirePermission } from "../../middlewares/requirePermission.js";
import { userLimiter } from "../../middlewares/rateLimiter.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { createChapterBody, listChaptersQuery, updateChapterBody } from "./schemas.js";
import { chapterService } from "./service.js";

const router = Router();

router.use(requireAuth);

router.post("/chapters", requirePermission("chapter:write"), validate({ body: createChapterBody }), async (req, res, next) => {
  try {
    const { title, sortOrder, imageUrl, label, content, teacherGuide, subjectId } = req.body as z.infer<typeof createChapterBody>;
    const chapter = await chapterService.create({ title, sortOrder, imageUrl, label, content, teacherGuide, subjectId });
    return res.status(201).json({ message: "Chapter created", data: chapter });
  } catch (err) {
    return next(err);
  }
});

router.get("/chapters", userLimiter(60, 60_000), validate({ query: listChaptersQuery }), async (req, res, next) => {
  try {
    const { page, limit, search, subjectId } = res.locals.query as z.infer<typeof listChaptersQuery>;
    const result = await chapterService.list({ page, limit, search, subjectId });
    return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
  } catch (err) {
    return next(err);
  }
});

router.get("/chapters/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const result = await chapterService.getById(BigInt(req.params.id as string));
    return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
  } catch (err) {
    return next(err);
  }
});

router.put("/chapters/:id", requirePermission("chapter:write"), validate({ params: idParam, body: updateChapterBody }), async (req, res, next) => {
  try {
    const { title, sortOrder, imageUrl, label, content, teacherGuide, subjectId } = req.body as z.infer<typeof updateChapterBody>;
    const updated = await chapterService.update(BigInt(req.params.id as string), { title, sortOrder, imageUrl, label, content, teacherGuide, subjectId });
    return res.json({ message: "Chapter updated", data: updated });
  } catch (err) {
    return next(err);
  }
});

router.delete("/chapters/:id", requirePermission("chapter:write"), validate({ params: idParam }), async (req, res, next) => {
  try {
    await chapterService.softDelete(BigInt(req.params.id as string));
    return res.json({ message: "Chapter deleted" });
  } catch (err) {
    return next(err);
  }
});

export default router;
