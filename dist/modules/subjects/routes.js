import { Router } from "express";
import { prisma } from "../../database/prisma.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import { getCache, invalidateCache, setCache } from "../../utils/cache.js";
import { createSubjectBody, listSubjectsQuery, updateSubjectBody } from "./schemas.js";
const router = Router();
router.use(requireAuth);
router.post("/subjects", requireRole("admin"), validate({ body: createSubjectBody }), async (req, res, next) => {
    try {
        const { name, description, image, gradeId } = req.body;
        const grade = await prisma.grade.findFirst({
            where: { id: BigInt(gradeId), isDeleted: false },
        });
        if (!grade) {
            return res.status(404).json({ message: "Grade not found" });
        }
        const subject = await prisma.subject.create({
            data: {
                name,
                description: description || null,
                image: image || null,
                gradeId: BigInt(gradeId),
            },
        });
        await invalidateCache("subjects:*");
        return res.status(201).json({ message: "Subject created", data: subject });
    }
    catch (error) {
        return next(error);
    }
});
router.get("/subjects", validate({ query: listSubjectsQuery }), async (req, res, next) => {
    try {
        const { page, limit, search, gradeId } = res.locals.query;
        const cacheKey = `subjects:list:${page}:${limit}:${gradeId || "all"}:${search || "all"}`;
        const { data: cached } = await getCache(cacheKey);
        if (cached)
            return res.set("X-Cache", "HIT").json(cached);
        const where = {
            isDeleted: false,
            ...(gradeId ? { gradeId: BigInt(gradeId) } : {}),
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
            prisma.subject.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.subject.count({ where }),
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
router.get("/subjects/:id", validate({ params: idParam }), async (req, res, next) => {
    try {
        const subjectId = BigInt(req.params.id);
        const cacheKey = `subjects:detail:${subjectId}`;
        const { data: cached } = await getCache(cacheKey);
        if (cached)
            return res.set("X-Cache", "HIT").json(cached);
        const subject = await prisma.subject.findFirst({
            where: { id: subjectId, isDeleted: false },
        });
        if (!subject) {
            return res.status(404).json({ message: "Subject not found" });
        }
        const response = { data: subject };
        await setCache(cacheKey, response, 600);
        return res.set("X-Cache", "MISS").json(response);
    }
    catch (error) {
        return next(error);
    }
});
router.put("/subjects/:id", requireRole("admin"), validate({ params: idParam, body: updateSubjectBody }), async (req, res, next) => {
    try {
        const subjectId = BigInt(req.params.id);
        const { name, description, image, gradeId } = req.body;
        const existingSubject = await prisma.subject.findFirst({
            where: { id: subjectId, isDeleted: false },
        });
        if (!existingSubject) {
            return res.status(404).json({ message: "Subject not found" });
        }
        if (gradeId !== undefined) {
            const grade = await prisma.grade.findFirst({
                where: { id: BigInt(gradeId), isDeleted: false },
            });
            if (!grade) {
                return res.status(404).json({ message: "Grade not found" });
            }
        }
        const updatedSubject = await prisma.subject.update({
            where: { id: subjectId },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(description !== undefined ? { description: description || null } : {}),
                ...(image !== undefined ? { image: image || null } : {}),
                ...(gradeId !== undefined ? { gradeId: BigInt(gradeId) } : {}),
            },
        });
        await invalidateCache("subjects:*");
        return res.json({ message: "Subject updated", data: updatedSubject });
    }
    catch (error) {
        return next(error);
    }
});
router.delete("/subjects/:id", requireRole("admin"), validate({ params: idParam }), async (req, res, next) => {
    try {
        const subjectId = BigInt(req.params.id);
        const existingSubject = await prisma.subject.findFirst({
            where: { id: subjectId, isDeleted: false },
        });
        if (!existingSubject) {
            return res.status(404).json({ message: "Subject not found" });
        }
        await prisma.subject.update({
            where: { id: subjectId },
            data: { isDeleted: true },
        });
        await invalidateCache("subjects:*");
        return res.json({ message: "Subject deleted" });
    }
    catch (error) {
        return next(error);
    }
});
export default router;
//# sourceMappingURL=routes.js.map