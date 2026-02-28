import { Router } from "express";
import { prisma } from "../../database/prisma.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { getCache, invalidateCache, setCache } from "../../utils/cache.js";
import { createGradeBody, listGradesQuery, updateGradeBody } from "./schemas.js";
const router = Router();
router.use(requireAuth);
router.post("/grades", requireRole("admin"), validate({ body: createGradeBody }), async (req, res, next) => {
    try {
        const { name, description, image, curriculumId } = req.body;
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
        await invalidateCache("grades:*");
        return res.status(201).json({ message: "Grade created", data: grade });
    }
    catch (error) {
        return next(error);
    }
});
router.get("/grades", validate({ query: listGradesQuery }), async (req, res, next) => {
    try {
        const { page, limit, search, curriculumId } = res.locals.query;
        const cacheKey = `grades:list:${page}:${limit}:${curriculumId || "all"}:${search || "all"}`;
        const { data: cached } = await getCache(cacheKey);
        if (cached)
            return res.set("X-Cache", "HIT").json(cached);
        const where = {
            isDeleted: false,
            ...(curriculumId ? { curriculumId: BigInt(curriculumId) } : {}),
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
            prisma.grade.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.grade.count({ where }),
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
        return res.set("X-Cache", "MISS").json(response);
    }
    catch (error) {
        return next(error);
    }
});
router.get("/grades/:id", validate({ params: idParam }), async (req, res, next) => {
    try {
        const gradeId = BigInt(req.params.id);
        const cacheKey = `grades:detail:${gradeId}`;
        const { data: cached } = await getCache(cacheKey);
        if (cached)
            return res.set("X-Cache", "HIT").json(cached);
        const grade = await prisma.grade.findFirst({
            where: { id: gradeId, isDeleted: false },
        });
        if (!grade) {
            return res.status(404).json({ message: "Grade not found" });
        }
        const response = { data: grade };
        await setCache(cacheKey, response, 600);
        return res.set("X-Cache", "MISS").json(response);
    }
    catch (error) {
        return next(error);
    }
});
router.put("/grades/:id", requireRole("admin"), validate({ params: idParam, body: updateGradeBody }), async (req, res, next) => {
    try {
        const gradeId = BigInt(req.params.id);
        const { name, description, image, curriculumId } = req.body;
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
        await invalidateCache("grades:*");
        return res.json({ message: "Grade updated", data: updatedGrade });
    }
    catch (error) {
        return next(error);
    }
});
router.delete("/grades/:id", requireRole("admin"), validate({ params: idParam }), async (req, res, next) => {
    try {
        const gradeId = BigInt(req.params.id);
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
        await invalidateCache("grades:*");
        return res.json({ message: "Grade deleted" });
    }
    catch (error) {
        return next(error);
    }
});
export default router;
//# sourceMappingURL=routes.js.map