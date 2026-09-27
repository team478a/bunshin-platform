CREATE TYPE "SocialActivityBarrierCategory" AS ENUM (
  'SETUP', 'HOW_TO', 'TIME', 'EFFORT', 'CONTENT', 'MEDIA',
  'CONFIDENCE', 'EFFECT', 'RESPONSE', 'LEAD', 'UNKNOWN'
);

CREATE TYPE "SocialActivityBarrierStatus" AS ENUM (
  'SUSPECTED', 'CONFIRMED', 'RESOLVED', 'DISMISSED'
);

CREATE TABLE "social_activity_barrier_cases" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "category" "SocialActivityBarrierCategory" NOT NULL,
  "status" "SocialActivityBarrierStatus" NOT NULL DEFAULT 'SUSPECTED',
  "rule_version" VARCHAR(80) NOT NULL,
  "recurrence_count" INTEGER NOT NULL DEFAULT 1,
  "first_detected_at" TIMESTAMPTZ(6) NOT NULL,
  "last_detected_at" TIMESTAMPTZ(6) NOT NULL,
  "next_eligible_at" TIMESTAMPTZ(6),
  "confirmed_at" TIMESTAMPTZ(6),
  "resolved_at" TIMESTAMPTZ(6),
  "dismissed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_activity_barrier_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "social_activity_barrier_evidence" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "evidence_key" VARCHAR(300) NOT NULL,
  "evidence_code" VARCHAR(80) NOT NULL,
  "observation_from" TIMESTAMPTZ(6) NOT NULL,
  "observation_to" TIMESTAMPTZ(6) NOT NULL,
  "eligible_days" INTEGER NOT NULL,
  "excluded_system_incident_days" INTEGER NOT NULL,
  "metrics" JSONB NOT NULL,
  "thresholds" JSONB NOT NULL,
  "rule_version" VARCHAR(80) NOT NULL,
  "detected_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_activity_barrier_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_activity_barrier_cases_scope_category_key"
  ON "social_activity_barrier_cases"("workspace_id", "group_id", "group_membership_id", "user_id", "bunshin_id", "category");
CREATE UNIQUE INDEX "social_activity_barrier_cases_scope_id_key"
  ON "social_activity_barrier_cases"("workspace_id", "group_id", "id");
CREATE INDEX "social_activity_barrier_cases_service_status_idx"
  ON "social_activity_barrier_cases"("workspace_id", "group_id", "status", "last_detected_at");
CREATE INDEX "social_activity_barrier_cases_bunshin_status_idx"
  ON "social_activity_barrier_cases"("workspace_id", "bunshin_id", "status");
CREATE UNIQUE INDEX "social_activity_barrier_evidence_idempotency_key"
  ON "social_activity_barrier_evidence"("case_id", "evidence_key");
CREATE INDEX "social_activity_barrier_evidence_case_detected_idx"
  ON "social_activity_barrier_evidence"("case_id", "detected_at");

ALTER TABLE "social_activity_barrier_cases"
  ADD CONSTRAINT "social_activity_barrier_cases_membership_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
  REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_activity_barrier_cases"
  ADD CONSTRAINT "social_activity_barrier_cases_bunshin_fkey"
  FOREIGN KEY ("workspace_id", "bunshin_id")
  REFERENCES "bunshins"("workspace_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_activity_barrier_evidence"
  ADD CONSTRAINT "social_activity_barrier_evidence_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "social_activity_barrier_cases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_activity_barrier_cases"
  ADD CONSTRAINT "social_activity_barrier_cases_recurrence_count_check"
  CHECK ("recurrence_count" >= 1);

ALTER TABLE "social_activity_barrier_evidence"
  ADD CONSTRAINT "social_activity_barrier_evidence_day_counts_check"
  CHECK ("eligible_days" >= 0 AND "excluded_system_incident_days" >= 0);

ALTER TABLE "social_activity_barrier_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_activity_barrier_evidence" ENABLE ROW LEVEL SECURITY;
