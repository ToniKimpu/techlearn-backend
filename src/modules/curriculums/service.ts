import { Prisma } from "../../../generated/prisma/index.js";

import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { createBaseService } from "../../utils/crudService.js";
import { AppError } from "../../utils/errors.js";

type CreateInput = { name: string; description?: string; image?: string };
type UpdateInput = { name?: string; description?: string; image?: string };
type ListInput = { page: number; limit: number; search?: string };

const base = createBaseService<ListInput>({
  model: prisma.curriculum,
  cachePrefix: "curriculums",
  entityName: "Curriculum",
  buildWhere: ({ search }) => ({
    isDeleted: false,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  }),
});

async function create(data: CreateInput) {
  try {
    const curriculum = await prisma.curriculum.create({
      data: {
        name: data.name,
        description: data.description || null,
        imageUrl: data.image || "",
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

async function update(id: bigint, data: UpdateInput) {
  try {
    const existing = await prisma.curriculum.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new AppError(404, "Curriculum not found");

    const updated = await prisma.curriculum.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.image !== undefined ? { imageUrl: data.image } : {}),
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

export const curriculumService = { ...base, create, update };
