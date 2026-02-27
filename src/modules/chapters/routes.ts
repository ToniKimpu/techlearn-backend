import { Router } from "express";
import type { z } from "zod";

import { prisma } from "../../database/prisma.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { getCache, invalidateCache, setCache } from "../../utils/cache.js";
import { createChapterBody, listChaptersQuery, updateChapterBody } from "./schemas.js";

const router = Router();

router.use(requireAuth);

router.post("/chapters", requireRole("admin"), validate({ body: createChapterBody }), async (req, res, next) => {
  try {
    const { title, sortOrder, imageUrl, label, content, teacherGuide, subjectId } =
      req.body as z.infer<typeof createChapterBody>;

    const subject = await prisma.subject.findFirst({
      where: { id: BigInt(subjectId), isDeleted: false },
    });

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const chapter = await prisma.chapter.create({
      data: {
        title,
        sortOrder,
        imageUrl: imageUrl || null,
        label: label || null,
        content: content || null,
        teacherGuide: teacherGuide || null,
        subjectId: BigInt(subjectId),
      },
    });

    await invalidateCache("chapters:*");

    return res.status(201).json({ message: "Chapter created", data: chapter });
  } catch (error) {
    return next(error);
  }
});

router.get("/chapters", validate({ query: listChaptersQuery }), async (req, res, next) => {
  try {
    const { page, limit, search, subjectId } = res.locals.query as z.infer<typeof listChaptersQuery>;

    const cacheKey = `chapters:list:${page}:${limit}:${subjectId || "all"}:${search || "all"}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const where = {
      isDeleted: false,
      ...(subjectId ? { subjectId: BigInt(subjectId) } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { label: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.chapter.findMany({
        where,
        orderBy: { sortOrder: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.chapter.count({ where }),
    ]);

    const response = {
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    await setCache(cacheKey, response, 300);

    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

router.get("/chapters/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const chapterId = BigInt(req.params.id as string);

    const cacheKey = `chapters:detail:${chapterId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, isDeleted: false },
    });

    if (!chapter) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    const response = { data: chapter };
    await setCache(cacheKey, response, 600);

    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

router.put("/chapters/:id", requireRole("admin"), validate({ params: idParam, body: updateChapterBody }), async (req, res, next) => {
  try {
    const chapterId = BigInt(req.params.id as string);
    const { title, sortOrder, imageUrl, label, content, teacherGuide, subjectId } =
      req.body as z.infer<typeof updateChapterBody>;

    const existingChapter = await prisma.chapter.findFirst({
      where: { id: chapterId, isDeleted: false },
    });

    if (!existingChapter) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    if (subjectId !== undefined) {
      const subject = await prisma.subject.findFirst({
        where: { id: BigInt(subjectId), isDeleted: false },
      });

      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }
    }

    const updatedChapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
        ...(label !== undefined ? { label: label || null } : {}),
        ...(content !== undefined ? { content: content || null } : {}),
        ...(teacherGuide !== undefined ? { teacherGuide: teacherGuide || null } : {}),
        ...(subjectId !== undefined ? { subjectId: BigInt(subjectId) } : {}),
      },
    });

    await invalidateCache("chapters:*");

    return res.json({ message: "Chapter updated", data: updatedChapter });
  } catch (error) {
    return next(error);
  }
});

router.delete("/chapters/:id", requireRole("admin"), validate({ params: idParam }), async (req, res, next) => {
  try {
    const chapterId = BigInt(req.params.id as string);

    const existingChapter = await prisma.chapter.findFirst({
      where: { id: chapterId, isDeleted: false },
    });

    if (!existingChapter) {
      return res.status(404).json({ message: "Chapter not found" });
    }

    await prisma.chapter.update({
      where: { id: chapterId },
      data: { isDeleted: true },
    });

    await invalidateCache("chapters:*");

    return res.json({ message: "Chapter deleted" });
  } catch (error) {
    return next(error);
  }
});

export default router;
