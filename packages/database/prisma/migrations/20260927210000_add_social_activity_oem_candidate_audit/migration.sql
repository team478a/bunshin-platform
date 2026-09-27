CREATE TABLE "social_activity_oem_support_candidate_audits" (
  "id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "before_status" "SocialActivityOemSupportCandidateStatus" NOT NULL,
  "after_status" "SocialActivityOemSupportCandidateStatus" NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_activity_oem_support_candidate_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_activity_oem_candidate_audits_candidate_fkey" FOREIGN KEY ("candidate_id") REFERENCES "social_activity_oem_support_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "social_activity_oem_candidate_audits_idx"
  ON "social_activity_oem_support_candidate_audits"("candidate_id", "occurred_at");

ALTER TABLE "social_activity_oem_support_candidate_audits" ENABLE ROW LEVEL SECURITY;
