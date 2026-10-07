-- Additive, no seed/backfill/fixture approval. Production application requires separate approval.
CREATE UNIQUE INDEX "program_goal_learning_scope_key" ON "program_member_goals"("workspace_id", "group_id", "program_enrollment_id", "group_membership_id", "id");
CREATE TABLE "personal_learning_goal_confirmations" (
  "program_member_goal_id" UUID PRIMARY KEY,
  "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL, "group_membership_id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "package_key" VARCHAR(80) NOT NULL, "goal_key" VARCHAR(80) NOT NULL, "semantic_version" VARCHAR(80) NOT NULL,
  "consultation_rule_version" VARCHAR(80) NOT NULL, "scope_rule_version" VARCHAR(80) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "learning_confirmation_scope_key" UNIQUE ("workspace_id", "group_id", "program_enrollment_id", "group_membership_id", "user_id", "program_member_goal_id"),
  CONSTRAINT "learning_confirmation_goal_fk" FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id", "group_membership_id", "program_member_goal_id") REFERENCES "program_member_goals"("workspace_id", "group_id", "program_enrollment_id", "group_membership_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "learning_confirmation_enrollment_fk" FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id", "group_membership_id") REFERENCES "program_enrollments"("workspace_id", "group_id", "id", "group_membership_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "learning_confirmation_membership_fk" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "personal_learning_plan_revisions" (
  "plan_id" UUID NOT NULL, "revision" INTEGER NOT NULL, "previous_revision" INTEGER,
  "revision_reason" VARCHAR(80) NOT NULL,
  "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL, "group_membership_id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "program_member_goal_id" UUID NOT NULL,
  "contract_version" VARCHAR(80) NOT NULL, "rule_version" VARCHAR(80) NOT NULL,
  "status" VARCHAR(20) NOT NULL, "steps" JSONB NOT NULL,
  "confirmed_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("plan_id", "revision"),
  CONSTRAINT "learning_plan_revision_check" CHECK ("revision" > 0 AND (("revision"=1 AND "previous_revision" IS NULL AND "revision_reason"='INITIAL') OR ("revision">1 AND "previous_revision"="revision"-1 AND "revision_reason"<>'INITIAL'))),
  CONSTRAINT "learning_plan_status_check" CHECK (("status"='DRAFT' AND "confirmed_at" IS NULL) OR ("status" IN ('CONFIRMED','SUPERSEDED','COMPLETED') AND "confirmed_at" IS NOT NULL)),
  CONSTRAINT "learning_plan_steps_check" CHECK (jsonb_typeof("steps")='array' AND jsonb_array_length("steps") BETWEEN 1 AND 100),
  CONSTRAINT "learning_plan_confirmation_fk" FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id", "group_membership_id", "user_id", "program_member_goal_id") REFERENCES "personal_learning_goal_confirmations"("workspace_id", "group_id", "program_enrollment_id", "group_membership_id", "user_id", "program_member_goal_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "personal_learning_plan_revisions_workspace_id_group_id_progr_idx" ON "personal_learning_plan_revisions"("workspace_id", "group_id", "program_enrollment_id");
CREATE TABLE "learning_definition_approvals" (
  "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL, "package_key" VARCHAR(80) NOT NULL,
  "definition_key" VARCHAR(80) NOT NULL, "version" VARCHAR(80) NOT NULL, "approval_status" VARCHAR(20) NOT NULL,
  "approved_at" TIMESTAMPTZ(3), "approved_by_user_id" UUID,
  PRIMARY KEY ("workspace_id", "group_id", "package_key", "definition_key", "version"),
  CONSTRAINT "learning_approval_status_check" CHECK ("approval_status" IN ('DRAFT','REVIEWED','APPROVED','DEPRECATED') AND ("approval_status"<>'APPROVED' OR ("approved_at" IS NOT NULL AND "approved_by_user_id" IS NOT NULL))),
  CONSTRAINT "learning_approval_group_fk" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "learning_approval_human_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Server-only records: no anonymous/authenticated direct policies are granted.
ALTER TABLE "personal_learning_goal_confirmations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "personal_learning_plan_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_definition_approvals" ENABLE ROW LEVEL SECURITY;
