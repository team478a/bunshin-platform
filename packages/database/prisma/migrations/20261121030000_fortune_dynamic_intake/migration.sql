CREATE TABLE "fortune_intake_turns" (
  "id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "local_date" DATE NOT NULL,
  "theme" "FortuneTheme" NOT NULL,
  "step" INTEGER NOT NULL CHECK ("step" BETWEEN 1 AND 5),
  "question_key" VARCHAR(16) CHECK ("question_key" IN ('SITUATION', 'REASON', 'VALUES', 'DESIRED', 'GOAL')),
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fortune_intake_turns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fortune_intake_turns_participant_id_fkey" FOREIGN KEY ("participant_id")
    REFERENCES "fortune_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "fortune_intake_turns_participant_id_local_date_step_key"
  ON "fortune_intake_turns"("participant_id", "local_date", "step");
CREATE INDEX "fortune_intake_turns_local_date_idx" ON "fortune_intake_turns"("local_date");
ALTER TABLE "fortune_intake_turns" ENABLE ROW LEVEL SECURITY;
