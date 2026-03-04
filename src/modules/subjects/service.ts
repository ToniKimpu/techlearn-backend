import { prisma } from "../../database/prisma.js";
import { getCache, invalidateCache, setCache } from "../../utils/cache.js";
import { AppError } from "../../utils/errors.js";

type CreateInput = { name: string; description?: string; image?: string; gradeId: string };
type UpdateInput = { name?: string; description?: string; image?: string; gradeId?: string };
type ListInput = {
  page: number;
  limit: number;
  search?: string;
  gradeId?: string;
  curriculumId?: string;
  include?: "chapters" | "breadcrumb";
};

async function create(data: CreateInput) {
  const grade = await prisma.grade.findFirst({
    where: { id: BigInt(data.gradeId), isDeleted: false },
  });
  if (!grade) throw new AppError(404, "Grade not found");

  const subject = await prisma.subject.create({
    data: {
      name: data.name,
      description: data.description || null,
      image: data.image || null,
      gradeId: BigInt(data.gradeId),
    },
  });

  await invalidateCache("subjects:*");
  return subject;
}

async function list({ page, limit, search, gradeId, curriculumId, include }: ListInput) {
  const cacheKey = `subjects:list:${page}:${limit}:${gradeId || "all"}:${curriculumId || "all"}:${search || "all"}:${include || "none"}`;
  const { data: cached } = await getCache(cacheKey);
  if (cached) return { cached: true, data: cached };

  const where = {
    isDeleted: false,
    ...(gradeId ? { gradeId: BigInt(gradeId) } : {}),
    ...(curriculumId ? { grade: { curriculumId: BigInt(curriculumId) } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { grade: { name: { contains: search, mode: "insensitive" as const } } },
            {
              grade: {
                curriculum: { name: { contains: search, mode: "insensitive" as const } },
              },
            },
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
      include:
        include === "chapters"
          ? { chapters: { where: { isDeleted: false } } }
          : include === "breadcrumb"
            ? {
                _count: { select: { chapters: { where: { isDeleted: false } } } },
                grade: { select: { name: true, curriculum: { select: { name: true } } } },
              }
            : { _count: { select: { chapters: { where: { isDeleted: false } } } } },
    }),
    prisma.subject.count({ where }),
  ]);

  const data = items.map(
    ({ _count, ...subject }: { _count?: { chapters: number }; [key: string]: unknown }) => ({
      ...subject,
      ...(include === "chapters" ? {} : { totalChapterCount: _count?.chapters ?? 0 }),
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
  const cacheKey = `subjects:detail:${id}`;
  const { data: cached } = await getCache(cacheKey);
  if (cached) return { cached: true, data: cached };

  const subject = await prisma.subject.findFirst({ where: { id, isDeleted: false } });
  if (!subject) throw new AppError(404, "Subject not found");

  const response = { data: subject };
  await setCache(cacheKey, response, 600);
  return { cached: false, data: response };
}

async function update(id: bigint, data: UpdateInput) {
  const existing = await prisma.subject.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Subject not found");

  if (data.gradeId !== undefined) {
    const grade = await prisma.grade.findFirst({
      where: { id: BigInt(data.gradeId), isDeleted: false },
    });
    if (!grade) throw new AppError(404, "Grade not found");
  }

  const updated = await prisma.subject.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.image !== undefined ? { image: data.image || null } : {}),
      ...(data.gradeId !== undefined ? { gradeId: BigInt(data.gradeId) } : {}),
    },
  });

  await invalidateCache("subjects:*");
  return updated;
}

async function softDelete(id: bigint) {
  const existing = await prisma.subject.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Subject not found");

  await prisma.subject.update({ where: { id }, data: { isDeleted: true } });
  await invalidateCache("subjects:*");
}

export const subjectService = { create, list, getById, update, softDelete };
