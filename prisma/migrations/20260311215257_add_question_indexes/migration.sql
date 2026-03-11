-- CreateIndex
CREATE INDEX "question_answers_question_id_idx" ON "question_answers"("question_id");

-- CreateIndex
CREATE INDEX "question_bloom_level_mapping_question_id_idx" ON "question_bloom_level_mapping"("question_id");

-- CreateIndex
CREATE INDEX "questions_chapter_id_idx" ON "questions"("chapter_id");

-- CreateIndex
CREATE INDEX "questions_subject_id_idx" ON "questions"("subject_id");

-- CreateIndex
CREATE INDEX "questions_type_idx" ON "questions"("type");

-- CreateIndex
CREATE INDEX "questions_created_by_idx" ON "questions"("created_by");

-- CreateIndex
CREATE INDEX "questions_is_deleted_idx" ON "questions"("is_deleted");
