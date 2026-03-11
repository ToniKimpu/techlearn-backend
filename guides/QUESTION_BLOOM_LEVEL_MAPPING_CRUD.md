# CRUD Guide: QuestionBloomLevelMapping

A join table linking `questions` ↔ `question_bloom_levels` (many-to-many).

> No list/get/update routes — you assign and remove bloom levels from a question.
> Backend only — no dedicated admin page needed (managed via the Question form).

---

## Prisma Model

Add to `prisma/schema.prisma`:

```prisma
model QuestionBloomLevelMapping {
  bloomLevelId BigInt @map("bloom_level_id")
  questionId   BigInt @map("question_id")

  bloomLevel QuestionBloomLevel @relation(fields: [bloomLevelId], references: [id])
  question   Question           @relation(fields: [questionId], references: [id])

  @@id([bloomLevelId, questionId])
  @@map("question_bloom_level_mapping")
}
```

Also add back-relations:

In `QuestionBloomLevel`:
```prisma
bloomLevelMappings QuestionBloomLevelMapping[]
```

In `Question`:
```prisma
bloomLevelMappings QuestionBloomLevelMapping[]
```

Then run:
```bash
npx prisma migrate dev --name add_question_bloom_level_mapping
```

---