import { prisma } from "../../database/prisma.js";
import { getCache, invalidateCache, setCache } from "../../utils/cache.js";
import { AppError } from "../../utils/errors.js";

type CreateInput = {
  title: string;
  sortOrder: number;
  subjectId: string;
  imageUrl?: string;
  label?: string;
  content?: string;
  teacherGuide?: string;
};
type UpdateInput = {
  title?: string;
  sortOrder?: number;
  subjectId?: string;
  imageUrl?: string;
  label?: string;
  content?: string;
  teacherGuide?: string;
};
type ListInput = { page: number; limit: number; search?: string; subjectId?: string };

async function create(data: CreateInput) {
  const subject = await prisma.subject.findFirst({ where: { id: BigInt(data.subjectId), isDeleted: false } });
  if (!subject) throw new AppError(404, "Subject not found");

  const chapter = await prisma.chapter.create({
    data: {
      title: data.title,
      sortOrder: data.sortOrder,
      imageUrl: data.imageUrl || null,
      label: data.label || null,
      content: data.content || null,
      teacherGuide: data.teacherGuide || null,
      subjectId: BigInt(data.subjectId),
    },
  });

  await invalidateCache("chapters:*");
  return chapter;
}

async function list({ page, limit, search, subjectId }: ListInput) {
  const cacheKey = `chapters:list:${page}:${limit}:${subjectId || "all"}:${search || "all"}`;
  const { data: cached } = await getCache(cacheKey);
  if (cached) return { cached: true, data: cached };

  const where = {
    isDeleted: false,
    ...(subjectId ? { subjectId: BigInt(subjectId) } : {}),
    ...(search
      ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { label: { contains: search, mode: "insensitive" as const } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.chapter.findMany({ where, orderBy: { sortOrder: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.chapter.count({ where }),
  ]);

  const response = { data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  await setCache(cacheKey, response, 300);
  return { cached: false, data: response };
}

async function getById(id: bigint) {
  const cacheKey = `chapters:detail:${id}`;
  const { data: cached } = await getCache(cacheKey);
  if (cached) return { cached: true, data: cached };

  const chapter = await prisma.chapter.findFirst({ where: { id, isDeleted: false } });
  if (!chapter) throw new AppError(404, "Chapter not found");

  const response = { data: chapter };
  await setCache(cacheKey, response, 600);
  return { cached: false, data: response };
}

async function update(id: bigint, data: UpdateInput) {
  const existing = await prisma.chapter.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Chapter not found");

  if (data.subjectId !== undefined) {
    const subject = await prisma.subject.findFirst({ where: { id: BigInt(data.subjectId), isDeleted: false } });
    if (!subject) throw new AppError(404, "Subject not found");
  }

  const updated = await prisma.chapter.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl || null } : {}),
      ...(data.label !== undefined ? { label: data.label || null } : {}),
      ...(data.content !== undefined ? { content: data.content || null } : {}),
      ...(data.teacherGuide !== undefined ? { teacherGuide: data.teacherGuide || null } : {}),
      ...(data.subjectId !== undefined ? { subjectId: BigInt(data.subjectId) } : {}),
    },
  });

  await invalidateCache("chapters:*");
  return updated;
}

async function softDelete(id: bigint) {
  const existing = await prisma.chapter.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Chapter not found");

  await prisma.chapter.update({ where: { id }, data: { isDeleted: true } });
  await invalidateCache("chapters:*");
}

export const chapterService = { create, list, getById, update, softDelete };
