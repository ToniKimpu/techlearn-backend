import { Router } from "express";
import type { z } from "zod";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { createSubjectBody, listSubjectsQuery, updateSubjectBody } from "./schemas.js";
import { subjectService } from "./service.js";

const router = Router();

router.use(requireAuth);

router.post("/subjects", requireRole("admin"), validate({ body: createSubjectBody }), async (req, res, next) => {
  try {
    const { name, description, image, gradeId } = req.body as z.infer<typeof createSubjectBody>;
    const subject = await subjectService.create({ name, description, image, gradeId });
    return res.status(201).json({ message: "Subject created", data: subject });
  } catch (err) {
    return next(err);
  }
});

router.get("/subjects", validate({ query: listSubjectsQuery }), async (req, res, next) => {
  try {
    const { page, limit, search, gradeId } = res.locals.query as z.infer<typeof listSubjectsQuery>;
    const result = await subjectService.list({ page, limit, search, gradeId });
    return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
  } catch (err) {
    return next(err);
  }
});

router.get("/subjects/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const result = await subjectService.getById(BigInt(req.params.id as string));
    return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
  } catch (err) {
    return next(err);
  }
});

router.put("/subjects/:id", requireRole("admin"), validate({ params: idParam, body: updateSubjectBody }), async (req, res, next) => {
  try {
    const { name, description, image, gradeId } = req.body as z.infer<typeof updateSubjectBody>;
    const updated = await subjectService.update(BigInt(req.params.id as string), { name, description, image, gradeId });
    return res.json({ message: "Subject updated", data: updated });
  } catch (err) {
    return next(err);
  }
});

router.delete("/subjects/:id", requireRole("admin"), validate({ params: idParam }), async (req, res, next) => {
  try {
    await subjectService.softDelete(BigInt(req.params.id as string));
    return res.json({ message: "Subject deleted" });
  } catch (err) {
    return next(err);
  }
});

export default router;
