CREATE TABLE "DiaryRecordChange" (
    "id" TEXT NOT NULL,
    "diaryActivityId" TEXT,
    "externalDiaryActivityId" TEXT,
    "changedByUserId" TEXT,
    "changedFields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiaryRecordChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiaryRecordChange_diaryActivityId_createdAt_idx" ON "DiaryRecordChange"("diaryActivityId", "createdAt");
CREATE INDEX "DiaryRecordChange_externalDiaryActivityId_createdAt_idx" ON "DiaryRecordChange"("externalDiaryActivityId", "createdAt");
CREATE INDEX "DiaryRecordChange_changedByUserId_createdAt_idx" ON "DiaryRecordChange"("changedByUserId", "createdAt");

ALTER TABLE "DiaryRecordChange" ADD CONSTRAINT "DiaryRecordChange_diaryActivityId_fkey" FOREIGN KEY ("diaryActivityId") REFERENCES "DiaryActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiaryRecordChange" ADD CONSTRAINT "DiaryRecordChange_externalDiaryActivityId_fkey" FOREIGN KEY ("externalDiaryActivityId") REFERENCES "ExternalDiaryActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiaryRecordChange" ADD CONSTRAINT "DiaryRecordChange_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
