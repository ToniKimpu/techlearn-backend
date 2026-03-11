-- CreateTable
CREATE TABLE "question_bloom_level_mapping" (
    "bloom_level_id" BIGINT NOT NULL,
    "question_id" BIGINT NOT NULL,

    CONSTRAINT "question_bloom_level_mapping_pkey" PRIMARY KEY ("bloom_level_id","question_id")
);

-- AddForeignKey
ALTER TABLE "question_bloom_level_mapping" ADD CONSTRAINT "question_bloom_level_mapping_bloom_level_id_fkey" FOREIGN KEY ("bloom_level_id") REFERENCES "question_bloom_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bloom_level_mapping" ADD CONSTRAINT "question_bloom_level_mapping_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
