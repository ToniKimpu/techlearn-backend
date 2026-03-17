import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { createBaseService } from "../../utils/crudService.js";
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

const base = createBaseService<ListInput>({
  model: prisma.subject,
  cachePrefix: "subjects",
  entityName: "Subject",
  buildWhere: ({ search, gradeId, curriculumId }) => ({
    isDeleted: false,
    ...(gradeId ? { gradeId: BigInt(gradeId) } : {}),
    ...(curriculumId ? { grade: { curriculumId: BigInt(curriculumId) } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { grade: { name: { contains: search, mode: "insensitive" } } },
            {
              grade: {
                curriculum: { name: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  }),
  listCacheKey: ({ gradeId, curriculumId, include }) =>
    `:${gradeId || "all"}:${curriculumId || "all"}:${include || "none"}`,
  listInclude: ({ include }) =>
    include === "chapters"
      ? { chapters: { where: { isDeleted: false } } }
      : include === "breadcrumb"
        ? {
            _count: { select: { chapters: { where: { isDeleted: false } } } },
            grade: { select: { name: true, curriculum: { select: { name: true } } } },
          }
        : { _count: { select: { chapters: { where: { isDeleted: false } } } } },
  transformItem: (item: { _count?: { chapters: number }; [key: string]: unknown }, { include }) => {
    const { _count, ...subject } = item;
    return {
      ...subject,
      ...(include === "chapters" ? {} : { totalChapterCount: _count?.chapters ?? 0 }),
    };
  },
});

async function create(data: CreateInput) {
  const grade = await prisma.grade.findFirst({
    where: { id: BigInt(data.gradeId), isDeleted: false },
  });
  if (!grade) throw new AppError(404, "Grade not found");

  const subject = await prisma.subject.create({
    data: {
      name: data.name,
      description: data.description || null,
      imageUrl: data.image || null,
      gradeId: BigInt(data.gradeId),
    },
  });

  await invalidateCache("subjects:*");
  return subject;
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
      ...(data.image !== undefined ? { imageUrl: data.image || null } : {}),
      ...(data.gradeId !== undefined ? { gradeId: BigInt(data.gradeId) } : {}),
    },
  });

  await invalidateCache("subjects:*");
  return updated;
}

export const subjectService = { ...base, create, update };
