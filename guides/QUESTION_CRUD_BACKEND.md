# CRUD Guide: Questions (Backend)

Full backend CRUD for `questions`, with nested answers, bloom levels, and type.
Filter by `typeId`, `chapterId`, `subjectId`. Mobile-friendly `include` via query param.

---

## API Endpoints

| Method | URL | Description |
|---|---|---|
| `POST` | `/api/v1/questions` | Create question + answers |
| `GET` | `/api/v1/questions` | List (paginated, filterable) |
| `GET` | `/api/v1/questions/:id` | Get one — optionally includes answers, bloomLevels, type |
| `PUT` | `/api/v1/questions/:id` | Update question fields |
| `PUT` | `/api/v1/questions/:id/answers` | Replace all answers |
| `PUT` | `/api/v1/questions/:id/bloom-levels` | Replace all bloom levels |
| `DELETE` | `/api/v1/questions/:id` | Soft delete |

---

## Step 1 — Add permission

In `src/config/roles.ts`:

```typescript
"question:write": [ROLES.admin],
```

---

## Step 2 — Schemas

Create `src/modules/questions/schemas.ts`:

```typescript
import xss from "xss";
import { z } from "zod";
import { paginationQuery } from "../../schemas/shared.js";

const sanitize = (val: string) => xss(val, { whiteList: {}, stripIgnoreTag: true });

const answerBody = z.object({
  answer: z.string().trim().min(1, "Answer is required").transform(sanitize),
  isCorrect: z.boolean().default(false),
});

export const createQuestionBody = z.object({
  question: z.string().trim().min(1, "Question is required").transform(sanitize),
  image: z.string().trim().optional(),
  explanation: z.string().trim().optional().transform((v) => (v ? sanitize(v) : v)),
  links: z.array(z.string().url()).optional(),
  type: z.number().int().positive().optional(),
  chapterId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
  answers: z.array(answerBody).min(1, "At least one answer required").optional(),
  bloomLevelIds: z.array(z.number().int().positive()).optional(),
});

export const updateQuestionBody = z.object({
  question: z.string().trim().min(1).optional().transform((v) => (v ? sanitize(v) : v)),
  image: z.string().trim().optional(),
  explanation: z.string().trim().optional().transform((v) => (v ? sanitize(v) : v)),
  links: z.array(z.string().url()).optional(),
  type: z.number().int().positive().optional(),
  chapterId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
});

export const updateAnswersBody = z.object({
  answers: z.array(answerBody).min(1, "At least one answer required"),
});

export const updateBloomLevelsBody = z.object({
  bloomLevelIds: z.array(z.number().int().positive()),
});

export const listQuestionsQuery = paginationQuery.extend({
  typeId: z.coerce.number().int().positive().optional(),
  chapterId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  // Mobile hint: pass include=answers,bloomLevels,type (comma-separated)
  include: z.string().optional(),
});
```

---

## Step 3 — Service

Create `src/modules/questions/service.ts`:

```typescript
import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { createCrudService } from "../../utils/crudService.js";
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

const base = createCrudService<CreateInput, UpdateInput, ListInput>({
  model: prisma.question,
  cachePrefix: "questions",
  entityName: "Question",
  buildWhere: ({ search, typeId, chapterId, subjectId }) => ({
    isDeleted: false,
    ...(typeId ? { type: typeId } : {}),
    ...(chapterId ? { chapterId } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(search
      ? { question: { contains: search, mode: "insensitive" } }
      : {}),
  }),
  listCacheKey: ({ typeId, chapterId, subjectId, include }) =>
    `:type${typeId ?? "all"}:ch${chapterId ?? "all"}:sub${subjectId ?? "all"}:inc${include ?? "none"}`,
  listInclude: ({ include }) => buildInclude(include),
});

async function create(data: CreateInput, createdBy: string) {
  const question = await prisma.question.create({
    data: {
      question: data.question,
      image: data.image || null,
      explanation: data.explanation || null,
      links: data.links ? JSON.stringify(data.links) : undefined,
      type: data.type ? BigInt(data.type) : null,
      chapterId: data.chapterId ? BigInt(data.chapterId) : null,
      subjectId: data.subjectId ? BigInt(data.subjectId) : null,
      createdBy,
    },
  });

  if (data.answers?.length) {
    await prisma.questionAnswer.createMany({
      data: data.answers.map((a) => ({
        answer: a.answer,
        isCorrect: a.isCorrect,
        questionId: question.id,
      })),
    });
  }

  if (data.bloomLevelIds?.length) {
    await prisma.questionBloomLevelMapping.createMany({
      data: data.bloomLevelIds.map((id) => ({
        bloomLevelId: BigInt(id),
        questionId: question.id,
      })),
    });
  }

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
      ...(data.links !== undefined ? { links: JSON.stringify(data.links) } : {}),
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

export const questionService = { ...base, create, getByIdWithIncludes, update, setAnswers, setBloomLevels };
```

---

## Step 4 — Routes

Create `src/modules/questions/routes.ts`:

```typescript
import { Router } from "express";
import type { z } from "zod";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requirePermission } from "../../middlewares/requirePermission.js";
import { userLimiter } from "../../middlewares/rateLimiter.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import {
  createQuestionBody,
  listQuestionsQuery,
  updateAnswersBody,
  updateBloomLevelsBody,
  updateQuestionBody,
} from "./schemas.js";
import { questionService } from "./service.js";

const router = Router();

router.use(requireAuth);

// Create
router.post(
  "/questions",
  requirePermission("question:write"),
  validate({ body: createQuestionBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createQuestionBody>;
      const question = await questionService.create(body, req.authUser!.profileId);
      return res.status(201).json({ message: "Question created", data: question });
    } catch (err) {
      return next(err);
    }
  }
);

// List  — ?page=&limit=&search=&typeId=&chapterId=&subjectId=&include=answers,bloomLevels,type
router.get(
  "/questions",
  userLimiter(60, 60_000),
  validate({ query: listQuestionsQuery }),
  async (req, res, next) => {
    try {
      const params = res.locals.query as z.infer<typeof listQuestionsQuery>;
      const result = await questionService.list(params);
      return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
    } catch (err) {
      return next(err);
    }
  }
);

// Get by ID — ?include=answers,bloomLevels,type
router.get(
  "/questions/:id",
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const includeParam = req.query.include as string | undefined;
      const result = await questionService.getByIdWithIncludes(
        BigInt(req.params.id as string),
        includeParam,
      );
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

// Update question fields
router.put(
  "/questions/:id",
  requirePermission("question:write"),
  validate({ params: idParam, body: updateQuestionBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof updateQuestionBody>;
      const updated = await questionService.update(BigInt(req.params.id as string), body);
      return res.json({ message: "Question updated", data: updated });
    } catch (err) {
      return next(err);
    }
  }
);

// Replace answers
router.put(
  "/questions/:id/answers",
  requirePermission("question:write"),
  validate({ params: idParam, body: updateAnswersBody }),
  async (req, res, next) => {
    try {
      const { answers } = req.body as z.infer<typeof updateAnswersBody>;
      await questionService.setAnswers(BigInt(req.params.id as string), answers);
      return res.json({ message: "Answers updated" });
    } catch (err) {
      return next(err);
    }
  }
);

// Replace bloom levels
router.put(
  "/questions/:id/bloom-levels",
  requirePermission("question:write"),
  validate({ params: idParam, body: updateBloomLevelsBody }),
  async (req, res, next) => {
    try {
      const { bloomLevelIds } = req.body as z.infer<typeof updateBloomLevelsBody>;
      await questionService.setBloomLevels(BigInt(req.params.id as string), bloomLevelIds);
      return res.json({ message: "Bloom levels updated" });
    } catch (err) {
      return next(err);
    }
  }
);

// Soft delete
router.delete(
  "/questions/:id",
  requirePermission("question:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      await questionService.softDelete(BigInt(req.params.id as string));
      return res.json({ message: "Question deleted" });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
```

---

## Step 5 — Register in app.ts

```typescript
import questionRoutes from "./modules/questions/routes.js";

app.use("/api/v1", questionRoutes);
```

---

## Step 6 — Test with curl

```bash
TOKEN="<your_access_token>"

# Create question with answers + bloom levels
curl -X POST http://localhost:4000/api/v1/questions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the capital of France?",
    "explanation": "Paris is the capital and largest city of France.",
    "type": 1,
    "subjectId": 1,
    "answers": [
      { "answer": "Paris", "isCorrect": true },
      { "answer": "London", "isCorrect": false },
      { "answer": "Berlin", "isCorrect": false }
    ],
    "bloomLevelIds": [1, 2]
  }'

# List all
curl "http://localhost:4000/api/v1/questions?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# List filtered by type
curl "http://localhost:4000/api/v1/questions?typeId=1&page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# List filtered by chapter
curl "http://localhost:4000/api/v1/questions?chapterId=1&page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Get by ID — full detail (answers + bloom levels + type)
curl "http://localhost:4000/api/v1/questions/1?include=answers,bloomLevels,type" \
  -H "Authorization: Bearer $TOKEN"

# Get by ID — mobile minimal (just answers)
curl "http://localhost:4000/api/v1/questions/1?include=answers" \
  -H "Authorization: Bearer $TOKEN"

# Update question fields only
curl -X PUT http://localhost:4000/api/v1/questions/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"explanation": "Updated explanation"}'

# Replace answers
curl -X PUT http://localhost:4000/api/v1/questions/1/answers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "answers": [
      { "answer": "Paris", "isCorrect": true },
      { "answer": "Lyon", "isCorrect": false }
    ]
  }'

# Replace bloom levels
curl -X PUT http://localhost:4000/api/v1/questions/1/bloom-levels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "bloomLevelIds": [1] }'

# Delete
curl -X DELETE http://localhost:4000/api/v1/questions/1 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Mobile `include` param — how it works

The `?include=` query param controls what gets nested in the response. This avoids over-fetching on mobile.

| `?include=` value | What gets returned |
|---|---|
| *(omitted)* | Question fields only |
| `answers` | + `answers[]` |
| `type` | + `questionType { id, name, code }` |
| `bloomLevels` | + `bloomLevelMappings[].bloomLevel` |
| `answers,bloomLevels,type` | Everything |

**GET by ID** always returns all includes by default (no param needed) — it's a detail view.
**GET list** returns no includes by default — pass `?include=` only when needed.

---

## Notes on `setAnswers`

Answers are soft-deleted (not hard-deleted) to preserve audit history. New answers are inserted fresh. This means a question can have historical answer rows with `isDeleted: true` — always filter by `isDeleted: false` when reading.

---

## Checklist

- [ ] Permission `"question:write"` added in `src/config/roles.ts`
- [ ] `src/modules/questions/schemas.ts` created
- [ ] `src/modules/questions/service.ts` created
- [ ] `src/modules/questions/routes.ts` created
- [ ] Route registered in `src/app.ts`
- [ ] Test: create question with answers + bloom levels
- [ ] Test: list filtered by `typeId`
- [ ] Test: get by ID with `?include=answers,bloomLevels,type`
- [ ] Test: replace answers via `PUT /questions/:id/answers`
- [ ] Test: replace bloom levels via `PUT /questions/:id/bloom-levels`
- [ ] Test: soft delete
