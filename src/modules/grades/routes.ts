import { Router } from "express";
import type { z } from "zod";

import { prisma } from "../../database/prisma.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { createGradeBody, listGradesQuery, updateGradeBody } from "./schemas.js";

const router = Router();

router.use(requireAuth);

router.post("/grades", validate({ body: createGradeBody }), async (req, res, next) => {
  try {
    const { name, description, image, curriculumId } = req.body as z.infer<typeof createGradeBody>;

    const curriculum = await prisma.curriculum.findFirst({
      where: { id: BigInt(curriculumId), isDeleted: false },
    });

    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    const grade = await prisma.grade.create({
      data: {
        name,
        description: description || null,
        image: image || null,
        curriculumId: BigInt(curriculumId),
      },
    });

    return res.status(201).json({ message: "Grade created", data: grade });
  } catch (error) {
    return next(error);
  }
});

router.get("/grades", validate({ query: listGradesQuery }), async (req, res, next) => {
  try {
    const { page, limit, search, curriculumId } = res.locals.query as z.infer<typeof listGradesQuery>;

    const where = {
      isDeleted: false,
      ...(curriculumId ? { curriculumId: BigInt(curriculumId) } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.grade.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.grade.count({ where }),
    ]);

    return res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/grades/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const gradeId = BigInt(req.params.id as string);

    const grade = await prisma.grade.findFirst({
      where: { id: gradeId, isDeleted: false },
    });

    if (!grade) {
      return res.status(404).json({ message: "Grade not found" });
    }

    return res.json({ data: grade });
  } catch (error) {
    return next(error);
  }
});

router.put("/grades/:id", validate({ params: idParam, body: updateGradeBody }), async (req, res, next) => {
  try {
    const gradeId = BigInt(req.params.id as string);
    const { name, description, image, curriculumId } = req.body as z.infer<typeof updateGradeBody>;

    const existingGrade = await prisma.grade.findFirst({
      where: { id: gradeId, isDeleted: false },
    });

    if (!existingGrade) {
      return res.status(404).json({ message: "Grade not found" });
    }

    if (curriculumId !== undefined) {
      const curriculum = await prisma.curriculum.findFirst({
        where: { id: BigInt(curriculumId), isDeleted: false },
      });

      if (!curriculum) {
        return res.status(404).json({ message: "Curriculum not found" });
      }
    }

    const updatedGrade = await prisma.grade.update({
      where: { id: gradeId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(image !== undefined ? { image: image || null } : {}),
        ...(curriculumId !== undefined ? { curriculumId: BigInt(curriculumId) } : {}),
      },
    });

    return res.json({ message: "Grade updated", data: updatedGrade });
  } catch (error) {
    return next(error);
  }
});

router.delete("/grades/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const gradeId = BigInt(req.params.id as string);

    const existingGrade = await prisma.grade.findFirst({
      where: { id: gradeId, isDeleted: false },
    });

    if (!existingGrade) {
      return res.status(404).json({ message: "Grade not found" });
    }

    await prisma.grade.update({
      where: { id: gradeId },
      data: { isDeleted: true },
    });

    return res.json({ message: "Grade deleted" });
  } catch (error) {
    return next(error);
  }
});

export default router;
