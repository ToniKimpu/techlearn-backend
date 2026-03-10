import { prisma } from "../../database/prisma.js";
import { getCache, invalidateCache, setCache } from "../../utils/cache.js";
import { AppError } from "../../utils/errors.js";

type CreateInput = { name: string; description?: string; image?: string; curriculumId: string };
type UpdateInput = { name?: string; description?: string; image?: string; curriculumId?: string };
type ListInput = {
  page: number;
  limit: number;
  search?: string;
  curriculumId?: string;
  include?: "subjects";
};

async function create(data: CreateInput) {
  const curriculum = await prisma.curriculum.findFirst({
    where: { id: BigInt(data.curriculumId), isDeleted: false },
  });
  if (!curriculum) throw new AppError(404, "Curriculum not found");

  const grade = await prisma.grade.create({
    data: {
      name: data.name,
      description: data.description || null,
      imageUrl: data.image || null,
      curriculumId: BigInt(data.curriculumId),
    },
  });

  await invalidateCache("grades:*");
  return grade;
}

async function list({ page, limit, search, curriculumId, include }: ListInput) {
  const cacheKey = `grades:list:${page}:${limit}:${curriculumId || "all"}:${search || "all"}:${include || "none"}`;
  const { data: cached } = await getCache(cacheKey);
  if (cached) return { cached: true, data: cached };

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
      include:
        include === "subjects"
          ? { subjects: { where: { isDeleted: false } }, curriculum: { select: { name: true } } }
          : {
              _count: { select: { subjects: { where: { isDeleted: false } } } },
              curriculum: { select: { name: true } },
            },
    }),
    prisma.grade.count({ where }),
  ]);

  const data = items.map(
    ({ _count, ...grade }: { _count?: { subjects: number }; [key: string]: unknown }) => ({
      ...grade,
      ...(include === "subjects" ? {} : { subjectCount: _count?.subjects ?? 0 }),
    })
  );

  const response = {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
  await setCache(cacheKey, response, 300);
  return { cached: false, data: response };
}

async function getById(id: bigint) {
  const cacheKey = `grades:detail:${id}`;
  const { data: cached } = await getCache(cacheKey);
  if (cached) return { cached: true, data: cached };

  const grade = await prisma.grade.findFirst({ where: { id, isDeleted: false } });
  if (!grade) throw new AppError(404, "Grade not found");

  const response = { data: grade };
  await setCache(cacheKey, response, 600);
  return { cached: false, data: response };
}

async function update(id: bigint, data: UpdateInput) {
  const existing = await prisma.grade.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Grade not found");

  if (data.curriculumId !== undefined) {
    const curriculum = await prisma.curriculum.findFirst({
      where: { id: BigInt(data.curriculumId), isDeleted: false },
    });
    if (!curriculum) throw new AppError(404, "Curriculum not found");
  }

  const updated = await prisma.grade.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.image !== undefined ? { imageUrl: data.image || null } : {}),
      ...(data.curriculumId !== undefined ? { curriculumId: BigInt(data.curriculumId) } : {}),
    },
  });

  await invalidateCache("grades:*");
  return updated;
}

async function softDelete(id: bigint) {
  const existing = await prisma.grade.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Grade not found");

  await prisma.grade.update({ where: { id }, data: { isDeleted: true } });
  await invalidateCache("grades:*");
}

export const gradeService = { create, list, getById, update, softDelete };
