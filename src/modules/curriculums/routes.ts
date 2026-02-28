import { Router } from "express";
import type { z } from "zod";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { createCurriculumBody, listCurriculumsQuery, updateCurriculumBody } from "./schemas.js";
import { curriculumService } from "./service.js";

const router = Router();

router.use(requireAuth);

router.post("/curriculums", requireRole("admin"), validate({ body: createCurriculumBody }), async (req, res, next) => {
  try {
    const { name, description, image } = req.body as z.infer<typeof createCurriculumBody>;
    const curriculum = await curriculumService.create({ name, description, image });
    return res.status(201).json({ message: "Curriculum created", data: curriculum });
  } catch (err) {
    return next(err);
  }
});

router.get("/curriculums", validate({ query: listCurriculumsQuery }), async (req, res, next) => {
  try {
    const { page, limit, search } = res.locals.query as z.infer<typeof listCurriculumsQuery>;
    const result = await curriculumService.list({ page, limit, search });
    return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
  } catch (err) {
    return next(err);
  }
});

router.get("/curriculums/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const result = await curriculumService.getById(BigInt(req.params.id as string));
    return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
  } catch (err) {
    return next(err);
  }
});

router.put("/curriculums/:id", requireRole("admin"), validate({ params: idParam, body: updateCurriculumBody }), async (req, res, next) => {
  try {
    const { name, description, image } = req.body as z.infer<typeof updateCurriculumBody>;
    const updated = await curriculumService.update(BigInt(req.params.id as string), { name, description, image });
    return res.json({ message: "Curriculum updated", data: updated });
  } catch (err) {
    return next(err);
  }
});

router.delete("/curriculums/:id", requireRole("admin"), validate({ params: idParam }), async (req, res, next) => {
  try {
    await curriculumService.softDelete(BigInt(req.params.id as string));
    return res.json({ message: "Curriculum deleted" });
  } catch (err) {
    return next(err);
  }
});

export default router;
