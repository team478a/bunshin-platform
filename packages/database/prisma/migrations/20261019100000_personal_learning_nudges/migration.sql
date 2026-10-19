CREATE TABLE "personal_learning_nudge_preferences" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "consent_version" VARCHAR(80),
  "consented_at" TIMESTAMPTZ(3),
  "paused_until" TIMESTAMPTZ(3),
  "stopped_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "personal_learning_nudge_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_learning_nudge_preferences_enrollment_fk"
    FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id", "group_membership_id")
    REFERENCES "program_enrollments"("workspace_id", "group_id", "id", "group_membership_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "personal_learning_nudge_preferences_membership_fk"
    FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
    REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "personal_learning_nudge_preferences_enrollment_key"
  ON "personal_learning_nudge_preferences"("program_enrollment_id");
CREATE UNIQUE INDEX "personal_learning_nudge_preference_scope_key"
  ON "personal_learning_nudge_preferences"("workspace_id", "group_id", "program_enrollment_id", "group_membership_id", "user_id");
CREATE UNIQUE INDEX "personal_learning_nudge_preference_enrollment_scope_key"
  ON "personal_learning_nudge_preferences"("workspace_id", "group_id", "program_enrollment_id", "group_membership_id");
CREATE INDEX "personal_learning_nudge_preference_active_idx"
  ON "personal_learning_nudge_preferences"("workspace_id", "group_id", "enabled", "updated_at");

ALTER TABLE "personal_learning_nudge_preferences" ENABLE ROW LEVEL SECURITY;
-- Deliberately no public policy. Access is restricted to the trusted application database role.

ALTER TABLE "personal_learning_line_pushes"
  DROP CONSTRAINT "personal_learning_line_push_purpose_check";
ALTER TABLE "personal_learning_line_pushes"
  ADD CONSTRAINT "personal_learning_line_push_purpose_check"
  CHECK ("purpose" IN ('RESPONSE', 'FALLBACK', 'NUDGE'));

CREATE INDEX "personal_learning_line_push_nudge_retention_idx"
  ON "personal_learning_line_pushes"("workspace_id", "group_id", "program_enrollment_id", "group_membership_id", "user_id", "purpose", "created_at");
