import { Router } from "express";
import type { z } from "zod";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requirePermission } from "../../middlewares/requirePermission.js";
import { userLimiter } from "../../middlewares/rateLimiter.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import {
  createQuestionBody,
  listQuestionsQuery,
  updateAnswersBody,
  updateBloomLevelsBody,
  updateQuestionBody,
} from "./schemas.js";
import { questionService } from "./service.js";

const router = Router();

router.use(requireAuth);

// Create
router.post(
  "/questions",
  requirePermission("question:write"),
  validate({ body: createQuestionBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createQuestionBody>;
      const question = await questionService.create(body, req.authUser!.profileId);
      return res.status(201).json({ message: "Question created", data: question });
    } catch (err) {
      return next(err);
    }
  }
);

// List  — ?page=&limit=&search=&typeId=&chapterId=&subjectId=&include=answers,bloomLevels,type
router.get(
  "/questions",
  userLimiter(60, 60_000),
  validate({ query: listQuestionsQuery }),
  async (req, res, next) => {
    try {
      const params = res.locals.query as z.infer<typeof listQuestionsQuery>;
      const result = await questionService.list(params);
      return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
    } catch (err) {
      return next(err);
    }
  }
);

// Get by ID — ?include=answers,bloomLevels,type
router.get("/questions/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const includeParam = req.query.include as string | undefined;
    const result = await questionService.getByIdWithIncludes(
      BigInt(req.params.id as string),
      includeParam
    );
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

// Update question fields
router.put(
  "/questions/:id",
  requirePermission("question:write"),
  validate({ params: idParam, body: updateQuestionBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof updateQuestionBody>;
      const updated = await questionService.update(BigInt(req.params.id as string), body);
      return res.json({ message: "Question updated", data: updated });
    } catch (err) {
      return next(err);
    }
  }
);

// Replace answers
router.put(
  "/questions/:id/answers",
  requirePermission("question:write"),
  validate({ params: idParam, body: updateAnswersBody }),
  async (req, res, next) => {
    try {
      const { answers } = req.body as z.infer<typeof updateAnswersBody>;
      await questionService.setAnswers(BigInt(req.params.id as string), answers);
      return res.json({ message: "Answers updated" });
    } catch (err) {
      return next(err);
    }
  }
);

// Replace bloom levels
router.put(
  "/questions/:id/bloom-levels",
  requirePermission("question:write"),
  validate({ params: idParam, body: updateBloomLevelsBody }),
  async (req, res, next) => {
    try {
      const { bloomLevelIds } = req.body as z.infer<typeof updateBloomLevelsBody>;
      await questionService.setBloomLevels(BigInt(req.params.id as string), bloomLevelIds);
      return res.json({ message: "Bloom levels updated" });
    } catch (err) {
      return next(err);
    }
  }
);

// Soft delete
router.delete(
  "/questions/:id",
  requirePermission("question:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      await questionService.softDelete(BigInt(req.params.id as string));
      return res.json({ message: "Question deleted" });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
