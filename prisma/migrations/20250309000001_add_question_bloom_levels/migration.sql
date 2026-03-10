-- CreateTable
CREATE TABLE "question_bloom_levels" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" VARCHAR NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sort_order" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "question_bloom_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_bloom_levels_name_key" ON "question_bloom_levels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "question_bloom_levels_color_key" ON "question_bloom_levels"("color");
