CREATE TYPE "TrainingParticipantRole" AS ENUM ('SALES', 'OFFICE', 'MANAGER', 'OTHER');
CREATE TYPE "TrainingParticipantAiLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE');
CREATE TYPE "TrainingAnswerEvaluationStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE TABLE "training_participant_profiles" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL, "program_enrollment_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL, "user_id" UUID NOT NULL, "role" "TrainingParticipantRole" NOT NULL,
  "ai_level" "TrainingParticipantAiLevel" NOT NULL, "current_topic" VARCHAR(80), "needs_review" BOOLEAN NOT NULL DEFAULT false,
  "recent_successes" INTEGER NOT NULL DEFAULT 0, "recent_failures" INTEGER NOT NULL DEFAULT 0, "streak" INTEGER NOT NULL DEFAULT 0,
  "updated_by_user_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "training_participant_profiles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "training_mission_answers" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL, "program_enrollment_id" UUID NOT NULL,
  "mission_assignment_id" UUID NOT NULL, "user_id" UUID NOT NULL, "answer" TEXT NOT NULL,
  "evaluation_status" "TrainingAnswerEvaluationStatus" NOT NULL DEFAULT 'PENDING', "evaluation" JSONB,
  "evaluated_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "training_mission_answers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "training_participant_profiles_program_enrollment_id_key" ON "training_participant_profiles"("program_enrollment_id");
CREATE UNIQUE INDEX "training_participant_profiles_scope_enrollment_key" ON "training_participant_profiles"("workspace_id", "group_id", "program_enrollment_id");
CREATE INDEX "training_participant_profiles_scope_user_idx" ON "training_participant_profiles"("workspace_id", "group_id", "user_id");
CREATE UNIQUE INDEX "training_mission_answers_mission_assignment_id_key" ON "training_mission_answers"("mission_assignment_id");
CREATE UNIQUE INDEX "training_mission_answers_scope_id_key" ON "training_mission_answers"("workspace_id", "group_id", "id");
CREATE INDEX "training_mission_answers_enrollment_created_idx" ON "training_mission_answers"("workspace_id", "group_id", "program_enrollment_id", "created_at");
CREATE INDEX "training_mission_answers_user_updated_idx" ON "training_mission_answers"("workspace_id", "group_id", "user_id", "updated_at");
ALTER TABLE "training_participant_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_mission_answers" ENABLE ROW LEVEL SECURITY;
