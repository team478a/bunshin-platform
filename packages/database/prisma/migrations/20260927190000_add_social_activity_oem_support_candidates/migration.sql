CREATE TYPE "SocialActivityOemSupportCandidateStatus" AS ENUM (
  'OPEN',
  'ACCEPTED',
  'DISMISSED',
  'COMPLETED'
);

CREATE TABLE "social_activity_oem_support_candidates" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "support_intervention_id" UUID NOT NULL,
  "evidence_id" UUID NOT NULL,
  "status" "SocialActivityOemSupportCandidateStatus" NOT NULL DEFAULT 'OPEN',
  "recommendation_key" VARCHAR(80) NOT NULL,
  "recommendation_snapshot" JSONB NOT NULL,
  "reason_code" VARCHAR(100) NOT NULL,
  "rule_version" VARCHAR(80) NOT NULL,
  "detected_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "dismissed_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_activity_oem_support_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_activity_oem_candidates_support_key" UNIQUE ("support_intervention_id"),
  CONSTRAINT "social_activity_oem_candidates_case_fkey" FOREIGN KEY ("case_id") REFERENCES "social_activity_barrier_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "social_activity_oem_candidates_support_fkey" FOREIGN KEY ("support_intervention_id") REFERENCES "social_activity_support_interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "social_activity_oem_candidates_evidence_fkey" FOREIGN KEY ("evidence_id") REFERENCES "social_activity_barrier_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "social_activity_oem_candidates_status_idx"
  ON "social_activity_oem_support_candidates"("status", "detected_at");

CREATE INDEX "social_activity_oem_candidates_case_idx"
  ON "social_activity_oem_support_candidates"("case_id", "detected_at");

ALTER TABLE "social_activity_oem_support_candidates" ENABLE ROW LEVEL SECURITY;
