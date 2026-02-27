import { Prisma } from "../../../generated/prisma/index.js";
import { Router } from "express";
import type { z } from "zod";

import { prisma } from "../../database/prisma.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { createCurriculumBody, listCurriculumsQuery, updateCurriculumBody } from "./schemas.js";

const router = Router();

router.use(requireAuth);

router.post("/curriculums", requireRole("admin"), validate({ body: createCurriculumBody }), async (req, res, next) => {
  try {
    const { name, description, image } = req.body as z.infer<typeof createCurriculumBody>;

    const curriculum = await prisma.curriculum.create({
      data: {
        name,
        description: description || null,
        image: image || "",
      },
    });

    return res.status(201).json({ message: "Curriculum created", data: curriculum });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({ message: "Curriculum name already exists" });
    }

    return next(error);
  }
});

router.get("/curriculums", validate({ query: listCurriculumsQuery }), async (req, res, next) => {
  try {
    const { page, limit, search } = res.locals.query as z.infer<typeof listCurriculumsQuery>;

    const where: Prisma.CurriculumWhereInput = {
      isDeleted: false,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.curriculum.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.curriculum.count({ where }),
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

router.get("/curriculums/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const curriculumId = BigInt(req.params.id as string);

    const curriculum = await prisma.curriculum.findFirst({
      where: { id: curriculumId, isDeleted: false },
    });

    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    return res.json({ data: curriculum });
  } catch (error) {
    return next(error);
  }
});

router.put("/curriculums/:id", requireRole("admin"), validate({ params: idParam, body: updateCurriculumBody }), async (req, res, next) => {
  try {
    const curriculumId = BigInt(req.params.id as string);
    const { name, description, image } = req.body as z.infer<typeof updateCurriculumBody>;

    const existingCurriculum = await prisma.curriculum.findFirst({
      where: { id: curriculumId, isDeleted: false },
    });

    if (!existingCurriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    const updatedCurriculum = await prisma.curriculum.update({
      where: { id: curriculumId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(image !== undefined ? { image } : {}),
      },
    });

    return res.json({ message: "Curriculum updated", data: updatedCurriculum });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({ message: "Curriculum name already exists" });
    }

    return next(error);
  }
});

router.delete("/curriculums/:id", requireRole("admin"), validate({ params: idParam }), async (req, res, next) => {
  try {
    const curriculumId = BigInt(req.params.id as string);

    const existingCurriculum = await prisma.curriculum.findFirst({
      where: { id: curriculumId, isDeleted: false },
    });

    if (!existingCurriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    await prisma.curriculum.update({
      where: { id: curriculumId },
      data: { isDeleted: true },
    });

    return res.json({ message: "Curriculum deleted" });
  } catch (error) {
    return next(error);
  }
});

export default router;
