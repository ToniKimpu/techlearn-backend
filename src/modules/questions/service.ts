import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { createBaseService } from "../../utils/crudService.js";
import { AppError } from "../../utils/errors.js";

type CreateInput = {
  question: string;
  image?: string;
  explanation?: string;
  links?: string[];
  type?: number;
  chapterId?: number;
  subjectId?: number;
  createdBy?: string;
  answers?: { answer: string; isCorrect: boolean }[];
  bloomLevelIds?: number[];
};

type UpdateInput = {
  question?: string;
  image?: string;
  explanation?: string;
  links?: string[];
  type?: number;
  chapterId?: number;
  subjectId?: number;
};

type ListInput = {
  page: number;
  limit: number;
  search?: string;
  typeId?: number;
  chapterId?: number;
  subjectId?: number;
  include?: string;
};

// Parse the ?include= query param into a Prisma include object
function buildInclude(includeParam?: string) {
  if (!includeParam) return undefined;
  const parts = includeParam.split(",").map((s) => s.trim());
  const include: Record<string, unknown> = {};
  if (parts.includes("answers")) {
    include.answers = { where: { isDeleted: false } };
  }
  if (parts.includes("bloomLevels")) {
    include.bloomLevelMappings = { include: { bloomLevel: true } };
  }
  if (parts.includes("type")) {
    include.questionType = true;
  }
  return Object.keys(include).length > 0 ? include : undefined;
}

const base = createBaseService<ListInput>({
  model: prisma.question,
  cachePrefix: "questions",
  entityName: "Question",
  buildWhere: ({ search, typeId, chapterId, subjectId }) => ({
    isDeleted: false,
    ...(typeId ? { type: typeId } : {}),
    ...(chapterId ? { chapterId } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(search ? { question: { contains: search, mode: "insensitive" } } : {}),
  }),
  listCacheKey: ({ typeId, chapterId, subjectId, include }) =>
    `:type${typeId ?? "all"}:ch${chapterId ?? "all"}:sub${subjectId ?? "all"}:inc${include ?? "none"}`,
  listInclude: ({ include }) => buildInclude(include),
});

async function create(data: CreateInput, createdBy: string) {
  const question = await prisma.$transaction(async (tx) => {
    const q = await tx.question.create({
      data: {
        question: data.question,
        image: data.image || null,
        explanation: data.explanation || null,
        links: data.links ?? undefined,
        type: data.type ? BigInt(data.type) : null,
        chapterId: data.chapterId ? BigInt(data.chapterId) : null,
        subjectId: data.subjectId ? BigInt(data.subjectId) : null,
        createdBy,
      },
    });

    if (data.answers?.length) {
      await tx.questionAnswer.createMany({
        data: data.answers.map((a) => ({
          answer: a.answer,
          isCorrect: a.isCorrect,
          questionId: q.id,
        })),
      });
    }

    if (data.bloomLevelIds?.length) {
      await tx.questionBloomLevelMapping.createMany({
        data: data.bloomLevelIds.map((id) => ({
          bloomLevelId: BigInt(id),
          questionId: q.id,
        })),
      });
    }

    return q;
  });

  await invalidateCache("questions:*");
  return question;
}

async function getByIdWithIncludes(id: bigint, includeParam?: string) {
  const include = buildInclude(includeParam) ?? {
    answers: { where: { isDeleted: false } },
    bloomLevelMappings: { include: { bloomLevel: true } },
    questionType: true,
  };

  const question = await prisma.question.findFirst({
    where: { id, isDeleted: false },
    include,
  });

  if (!question) throw new AppError(404, "Question not found");
  return { data: question };
}

async function update(id: bigint, data: UpdateInput) {
  const existing = await prisma.question.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new AppError(404, "Question not found");

  const updated = await prisma.question.update({
    where: { id },
    data: {
      ...(data.question !== undefined ? { question: data.question } : {}),
      ...(data.image !== undefined ? { image: data.image || null } : {}),
      ...(data.explanation !== undefined ? { explanation: data.explanation || null } : {}),
      ...(data.links !== undefined ? { links: data.links } : {}),
      ...(data.type !== undefined ? { type: BigInt(data.type) } : {}),
      ...(data.chapterId !== undefined ? { chapterId: BigInt(data.chapterId) } : {}),
      ...(data.subjectId !== undefined ? { subjectId: BigInt(data.subjectId) } : {}),
    },
  });

  await invalidateCache("questions:*");
  return updated;
}

async function setAnswers(questionId: bigint, answers: { answer: string; isCorrect: boolean }[]) {
  await prisma.$transaction([
    prisma.questionAnswer.updateMany({
      where: { questionId },
      data: { isDeleted: true },
    }),
    prisma.questionAnswer.createMany({
      data: answers.map((a) => ({ ...a, questionId })),
    }),
  ]);
  await invalidateCache("questions:*");
}

async function setBloomLevels(questionId: bigint, bloomLevelIds: number[]) {
  await prisma.$transaction([
    prisma.questionBloomLevelMapping.deleteMany({ where: { questionId } }),
    prisma.questionBloomLevelMapping.createMany({
      data: bloomLevelIds.map((id) => ({ bloomLevelId: BigInt(id), questionId })),
    }),
  ]);
  await invalidateCache("questions:*");
}

export const questionService = {
  ...base,
  create,
  getByIdWithIncludes,
  update,
  setAnswers,
  setBloomLevels,
};
