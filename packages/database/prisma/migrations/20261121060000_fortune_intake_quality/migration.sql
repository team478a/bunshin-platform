CREATE TABLE "fortune_intake_sessions" (
  "participant_id" UUID NOT NULL,
  "local_date" DATE NOT NULL,
  "questions_shown" INTEGER NOT NULL DEFAULT 0 CHECK ("questions_shown" BETWEEN 0 AND 5),
  "outcome" VARCHAR(8) CHECK ("outcome" IN ('REVIEWED', 'SKIPPED')),
  CONSTRAINT "fortune_intake_sessions_pkey" PRIMARY KEY ("participant_id", "local_date"),
  CONSTRAINT "fortune_intake_sessions_participant_id_fkey" FOREIGN KEY ("participant_id")
    REFERENCES "fortune_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "fortune_intake_sessions_local_date_idx" ON "fortune_intake_sessions"("local_date");
ALTER TABLE "fortune_intake_sessions" ENABLE ROW LEVEL SECURITY;
