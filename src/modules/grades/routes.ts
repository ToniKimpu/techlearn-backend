import { Router } from "express";
import type { z } from "zod";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requirePermission } from "../../middlewares/requirePermission.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { createGradeBody, listGradesQuery, updateGradeBody } from "./schemas.js";
import { gradeService } from "./service.js";

const router = Router();

router.use(requireAuth);

router.post("/grades", requirePermission("grade:write"), validate({ body: createGradeBody }), async (req, res, next) => {
  try {
    const { name, description, image, curriculumId } = req.body as z.infer<typeof createGradeBody>;
    const grade = await gradeService.create({ name, description, image, curriculumId });
    return res.status(201).json({ message: "Grade created", data: grade });
  } catch (err) {
    return next(err);
  }
});

router.get("/grades", validate({ query: listGradesQuery }), async (req, res, next) => {
  try {
    const { page, limit, search, curriculumId } = res.locals.query as z.infer<typeof listGradesQuery>;
    const result = await gradeService.list({ page, limit, search, curriculumId });
    return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
  } catch (err) {
    return next(err);
  }
});

router.get("/grades/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const result = await gradeService.getById(BigInt(req.params.id as string));
    return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
  } catch (err) {
    return next(err);
  }
});

router.put("/grades/:id", requirePermission("grade:write"), validate({ params: idParam, body: updateGradeBody }), async (req, res, next) => {
  try {
    const { name, description, image, curriculumId } = req.body as z.infer<typeof updateGradeBody>;
    const updated = await gradeService.update(BigInt(req.params.id as string), { name, description, image, curriculumId });
    return res.json({ message: "Grade updated", data: updated });
  } catch (err) {
    return next(err);
  }
});

router.delete("/grades/:id", requirePermission("grade:write"), validate({ params: idParam }), async (req, res, next) => {
  try {
    await gradeService.softDelete(BigInt(req.params.id as string));
    return res.json({ message: "Grade deleted" });
  } catch (err) {
    return next(err);
  }
});

export default router;
