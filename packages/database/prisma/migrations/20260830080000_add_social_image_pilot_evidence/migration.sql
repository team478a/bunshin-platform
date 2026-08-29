CREATE TYPE "SocialImagePilotEvidenceCheckKey" AS ENUM (
  'PLAN_APPROVAL',
  'STORAGE_RETENTION',
  'MOBILE_E2E',
  'SECURITY_ISOLATION',
  'TEN_THEME_VALIDATION',
  'FINAL_APPROVAL'
);

CREATE TYPE "SocialImagePilotEvidenceAction" AS ENUM ('RECORDED', 'REVOKED');

CREATE TABLE "social_image_pilot_evidence" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "pilot_id" UUID NOT NULL,
  "check_key" "SocialImagePilotEvidenceCheckKey" NOT NULL,
  "action" "SocialImagePilotEvidenceAction" NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "evidence_url" VARCHAR(2048),
  "actor_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_image_pilot_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_image_pilot_evidence_pilot_fkey"
    FOREIGN KEY ("workspace_id", "group_id", "pilot_id")
    REFERENCES "social_image_generation_pilots"("workspace_id", "group_id", "id")
    ON DELETE RESTRICT,
  CONSTRAINT "social_image_pilot_evidence_actor_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_pilot_evidence_reason_check"
    CHECK (char_length(btrim("reason")) BETWEEN 10 AND 1000),
  CONSTRAINT "social_image_pilot_evidence_url_check"
    CHECK ("evidence_url" IS NULL OR "evidence_url" LIKE 'https://%')
);

CREATE INDEX "social_image_pilot_evidence_scope_check_time_idx"
  ON "social_image_pilot_evidence"("workspace_id", "group_id", "pilot_id", "check_key", "occurred_at");
CREATE INDEX "social_image_pilot_evidence_actor_time_idx"
  ON "social_image_pilot_evidence"("actor_user_id", "occurred_at");
