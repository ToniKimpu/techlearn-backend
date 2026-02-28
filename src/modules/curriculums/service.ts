import { Prisma } from "../../../generated/prisma/index.js";

import { prisma } from "../../database/prisma.js";
import { getCache, invalidateCache, setCache } from "../../utils/cache.js";
import { AppError } from "../../utils/errors.js";

type CreateInput = { name: string; description?: string; image?: string };
type UpdateInput = { name?: string; description?: string; image?: string };
type ListInput = { page: number; limit: number; search?: string };

async function create(data: CreateInput) {
  try {
    const curriculum = await prisma.curriculum.create({
      data: {
        name: data.name,
        description: data.description || null,
        image: data.image || "",
      },
    });
    await invalidateCache("curriculums:*");
    return curriculum;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Curriculum name already exists");
    }
    throw err;
  }
}

async function list({ page, limit, search }: ListInput) {
  const cacheKey = `curriculums:list:${page}:${limit}:${search || "all"}`;
  const { data: cached } = await getCache(cacheKey);
  if (cached) return { cached: true, data: cached };

  const where: Prisma.CurriculumWhereInput = {
    isDeleted: false,
    ...(search
      ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.curriculum.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.curriculum.count({ where }),
  ]);

  const response = { data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  await setCache(cacheKey, response, 300);
  return { cached: false, data: response };
}

async function getById(id: bigint) {
  const cacheKey = `curriculums:detail:${id}`;
  const { data: cached } = await getCache(cacheKey);
  if (cached) return { cached: true, data: cached };

  const curriculum = await prisma.curriculum.findFirst({ where: { id, isDeleted: false } });
  if (!curriculum) throw new AppError(404, "Curriculum not found");

  const response = { data: curriculum };
  await setCache(cacheKey, response, 600);
  return { cached: false, data: response };
}

async function update(id: bigint, data: UpdateInput) {
  try {
    const existing = await prisma.curriculum.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new AppError(404, "Curriculum not found");

    const updated = await prisma.curriculum.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.image !== undefined ? { image: data.image } : {}),
      },
    });

    await invalidateCache("curriculums:*");
    return updated;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Curriculum name already exists");
    }
    throw err;
  }
}

async function softDelete(id: bigint) {
  const existing = await prisma.curriculum.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Curriculum not found");

  await prisma.curriculum.update({ where: { id }, data: { isDeleted: true } });
  await invalidateCache("curriculums:*");
}

export const curriculumService = { create, list, getById, update, softDelete };
