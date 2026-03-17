import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { createBaseService } from "../../utils/crudService.js";
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

const base = createBaseService<ListInput>({
  model: prisma.grade,
  cachePrefix: "grades",
  entityName: "Grade",
  buildWhere: ({ search, curriculumId }) => ({
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
  }),
  listCacheKey: ({ curriculumId, include }) => `:${curriculumId || "all"}:${include || "none"}`,
  listInclude: ({ include }) =>
    include === "subjects"
      ? { subjects: { where: { isDeleted: false } }, curriculum: { select: { name: true } } }
      : {
          _count: { select: { subjects: { where: { isDeleted: false } } } },
          curriculum: { select: { name: true } },
        },
  transformItem: (item: { _count?: { subjects: number }; [key: string]: unknown }, { include }) => {
    const { _count, ...grade } = item;
    return {
      ...grade,
      ...(include === "subjects" ? {} : { subjectCount: _count?.subjects ?? 0 }),
    };
  },
});

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

export const gradeService = { ...base, create, update };
