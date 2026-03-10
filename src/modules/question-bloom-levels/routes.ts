import { Router } from "express";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requirePermission } from "../../middlewares/requirePermission.js";
import { validate } from "../../middlewares/validate.js";
import {
  createQuestionBloomLevelBody,
  listQuestionBloomLevelQuery,
  updateQuestionBloomLevelBody,
} from "./schemas.js";
import z from "zod";
import { questionBloomLevelService } from "./service.js";
import { userLimiter } from "../../middlewares/rateLimiter.js";
import { idParam } from "../../schemas/shared.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/question-bloom-levels",
  requirePermission("question-bloom-level:write"),
  validate({ body: createQuestionBloomLevelBody }),
  async (req, res, next) => {
    try {
      const { name, description, color, sortOrder } = req.body as z.infer<
        typeof createQuestionBloomLevelBody
      >;
      const level = await questionBloomLevelService.create({
        name,
        description,
        color,
        sortOrder,
      });

      return res.status(201).json({
        message: "Question Bloom Level created successfully",
        data: level,
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/question-bloom-levels",
  userLimiter(60, 60_000),

  validate({ query: listQuestionBloomLevelQuery }),
  async (req, res, next) => {
    try {
      const { page, limit, search } = res.locals.query as z.infer<
        typeof listQuestionBloomLevelQuery
      >;

      const result = await questionBloomLevelService.list({ page, limit, search });
      return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
    } catch (err) {
      return next(err);
    }
  }
);

router.get("/question-bloom-levels/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const result = await questionBloomLevelService.getById(BigInt(req.params.id as string));
    return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
  } catch (err) {
    return next(err);
  }
});

router.put(
  "/question-bloom-levels/:id",
  requirePermission("question-bloom-level:write"),
  validate({ params: idParam, body: updateQuestionBloomLevelBody }),
  async (req, res, next) => {
    try {
      const { name, description, color, sortOrder } = req.body as z.infer<
        typeof updateQuestionBloomLevelBody
      >;
      const updated = await questionBloomLevelService.update(BigInt(req.params.id as string), {
        name,
        description,
        color,
        sortOrder,
      });
      return res.json({ message: "QuestionBloomLevel updated", data: updated });
    } catch (err) {
      return next(err);
    }
  }
);

router.delete(
  "/question-bloom-levels/:id",
  requirePermission("question-bloom-level:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      await questionBloomLevelService.softDelete(BigInt(req.params.id as string));
      return res.json({ message: "QuestionBloomLevel deleted" });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
