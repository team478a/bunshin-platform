CREATE TABLE "personal_learning_persona_profiles" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "opted_in" BOOLEAN NOT NULL DEFAULT false,
  "consent_version" VARCHAR(80),
  "opted_in_at" TIMESTAMPTZ(3),
  "opted_out_at" TIMESTAMPTZ(3),
  "dismissed_until" TIMESTAMPTZ(3),
  "company_name" VARCHAR(80),
  "age_band" VARCHAR(20),
  "industry_job" VARCHAR(80),
  "last_learner_use_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "personal_learning_persona_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personal_learning_persona_profiles_member_key"
  ON "personal_learning_persona_profiles"("workspace_id", "group_id", "group_membership_id");
CREATE UNIQUE INDEX "personal_learning_persona_profiles_member_user_key"
  ON "personal_learning_persona_profiles"("workspace_id", "group_id", "group_membership_id", "user_id");
CREATE INDEX "personal_learning_persona_profiles_opted_in_idx"
  ON "personal_learning_persona_profiles"("workspace_id", "group_id", "opted_in", "updated_at");

ALTER TABLE "personal_learning_persona_profiles"
  ADD CONSTRAINT "personal_learning_persona_profiles_member_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
  REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personal_learning_persona_profiles" ENABLE ROW LEVEL SECURITY;
-- No direct client policies: access is limited to scoped server-side repositories.
