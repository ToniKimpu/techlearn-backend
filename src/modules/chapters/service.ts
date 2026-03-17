import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { createBaseService } from "../../utils/crudService.js";
import { AppError } from "../../utils/errors.js";

type CreateInput = {
  title: string;
  sortOrder?: number;
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
type ListInput = {
  page: number;
  limit: number;
  search?: string;
  subjectId?: string;
  gradeId?: string;
  curriculumId?: string;
  include?: "breadcrumb";
};

const base = createBaseService<ListInput>({
  model: prisma.chapter,
  cachePrefix: "chapters",
  entityName: "Chapter",
  orderBy: { sortOrder: "asc" },
  buildWhere: ({ search, subjectId, gradeId, curriculumId }) => ({
    isDeleted: false,
    ...(subjectId ? { subjectId: BigInt(subjectId) } : {}),
    ...(gradeId ? { subject: { gradeId: BigInt(gradeId) } } : {}),
    ...(curriculumId ? { subject: { grade: { curriculumId: BigInt(curriculumId) } } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { label: { contains: search, mode: "insensitive" } },
            { subject: { name: { contains: search, mode: "insensitive" } } },
            { subject: { grade: { name: { contains: search, mode: "insensitive" } } } },
            {
              subject: {
                grade: { curriculum: { name: { contains: search, mode: "insensitive" } } },
              },
            },
          ],
        }
      : {}),
  }),
  listCacheKey: ({ subjectId, gradeId, curriculumId, include }) =>
    `:${subjectId || "all"}:${gradeId || "all"}:${curriculumId || "all"}:${include || "none"}`,
  listInclude: ({ include }) =>
    include === "breadcrumb"
      ? {
          subject: {
            select: {
              id: true,
              name: true,
              grade: { select: { name: true, curriculum: { select: { name: true } } } },
              _count: { select: { chapters: { where: { isDeleted: false } } } },
            },
          },
        }
      : undefined,
});

async function create(data: CreateInput) {
  const subject = await prisma.subject.findFirst({
    where: { id: BigInt(data.subjectId), isDeleted: false },
  });
  if (!subject) throw new AppError(404, "Subject not found");

  let sortOrder = data.sortOrder;
  if (sortOrder === undefined) {
    const last = await prisma.chapter.findFirst({
      where: { subjectId: BigInt(data.subjectId), isDeleted: false },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    sortOrder = last ? Number(last.sortOrder) + 1 : 1;
  }

  const chapter = await prisma.chapter.create({
    data: {
      title: data.title,
      sortOrder,
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

async function update(id: bigint, data: UpdateInput) {
  const existing = await prisma.chapter.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Chapter not found");

  if (data.subjectId !== undefined) {
    const subject = await prisma.subject.findFirst({
      where: { id: BigInt(data.subjectId), isDeleted: false },
    });
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

export const chapterService = { ...base, create, update };
