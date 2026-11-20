CREATE TABLE "fortune_reading_follow_ups" (
  "id" UUID NOT NULL,
  "reading_id" UUID NOT NULL,
  "turn" INTEGER NOT NULL CHECK ("turn" BETWEEN 1 AND 2),
  "status" VARCHAR(12) NOT NULL CHECK ("status" IN ('PENDING', 'READY', 'FAILED', 'ERASED')),
  "question" VARCHAR(300),
  "answer" TEXT,
  "action_step" VARCHAR(200),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fortune_reading_follow_ups_pkey" PRIMARY KEY ("reading_id", "id"),
  CONSTRAINT "fortune_reading_follow_ups_reading_id_fkey" FOREIGN KEY ("reading_id")
    REFERENCES "fortune_readings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "fortune_reading_follow_ups_reading_id_turn_key"
  ON "fortune_reading_follow_ups"("reading_id", "turn");

ALTER TABLE "fortune_reading_follow_ups" ENABLE ROW LEVEL SECURITY;
