CREATE TYPE "FortuneFeedbackRating" AS ENUM ('HELPFUL', 'SOMEWHAT', 'NOT_HELPFUL');

ALTER TABLE "fortune_readings"
  ADD COLUMN "first_viewed_at" TIMESTAMPTZ(6);

CREATE TABLE "fortune_feedback" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "service_setting_id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "member_user_id" UUID NOT NULL,
  "reading_id" UUID NOT NULL,
  "rating" "FortuneFeedbackRating" NOT NULL,
  "issue_code" VARCHAR(40),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fortune_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fortune_feedback_issue_code_check" CHECK (
    "issue_code" IS NULL OR (
      "rating" = 'NOT_HELPFUL' AND
      "issue_code" IN ('TOO_VAGUE', 'HARD_TO_UNDERSTAND', 'UNCOMFORTABLE', 'OTHER')
    )
  )
);

ALTER TABLE "fortune_feedback" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "fortune_feedback_reading_id_key" ON "fortune_feedback"("reading_id");
CREATE UNIQUE INDEX "fortune_feedback_scope_reading_key"
  ON "fortune_feedback"("workspace_id", "group_id", "service_setting_id", "participant_id", "member_user_id", "reading_id");
CREATE INDEX "fortune_feedback_service_rating_created_idx" ON "fortune_feedback"("service_setting_id", "rating", "created_at" DESC);
CREATE INDEX "fortune_feedback_member_created_idx" ON "fortune_feedback"("member_user_id", "created_at" DESC);
CREATE UNIQUE INDEX "fortune_readings_feedback_scope_key"
  ON "fortune_readings"("workspace_id", "group_id", "service_setting_id", "participant_id", "member_user_id", "id");

ALTER TABLE "fortune_feedback" ADD CONSTRAINT "fortune_feedback_service_scope_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "service_setting_id")
  REFERENCES "fortune_service_settings"("workspace_id", "group_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fortune_feedback" ADD CONSTRAINT "fortune_feedback_participant_scope_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "participant_id", "member_user_id")
  REFERENCES "fortune_participants"("workspace_id", "group_id", "id", "user_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fortune_feedback" ADD CONSTRAINT "fortune_feedback_member_user_id_fkey"
  FOREIGN KEY ("member_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fortune_feedback" ADD CONSTRAINT "fortune_feedback_reading_id_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "service_setting_id", "participant_id", "member_user_id", "reading_id")
  REFERENCES "fortune_readings"("workspace_id", "group_id", "service_setting_id", "participant_id", "member_user_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
