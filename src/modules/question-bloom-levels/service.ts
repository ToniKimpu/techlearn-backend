import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { createBaseService } from "../../utils/crudService.js";
import { AppError } from "../../utils/errors.js";
import { Prisma } from "../../../generated/prisma/index.js";

type CreateInput = {
  name: string;
  description?: string;
  color: string;
  sortOrder?: number;
};

type UpdateInput = {
  name?: string;
  description?: string;
  color?: string;
  sortOrder?: number;
};

type ListInput = { page: number; limit: number; search?: string };

const base = createBaseService<ListInput>({
  model: prisma.questionBloomLevel,
  cachePrefix: "question-bloom-levels",
  entityName: "QuestionBloomLevel",
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
    const level = await prisma.questionBloomLevel.create({
      data: {
        name: data.name,
        description: data.description || null,
        color: data.color,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await invalidateCache("question-bloom-levels:*");
    return level;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Name or color already exists");
    }
    throw err;
  }
}

async function update(id: bigint, data: UpdateInput) {
  try {
    const existing = await prisma.questionBloomLevel.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new AppError(404, "QuestionBloomLevel not found");

    const updated = await prisma.questionBloomLevel.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });

    await invalidateCache("question-bloom-levels:*");
    return updated;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Name or color already exists");
    }
    throw err;
  }
}

export const questionBloomLevelService = { ...base, create, update };
