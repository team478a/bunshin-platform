CREATE TYPE "BadgeApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "BadgeCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "badge_approval_requests" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL,
  "badge_version_id" UUID NOT NULL, "status" "BadgeApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requested_by_user_id" UUID NOT NULL, "reviewed_by_user_id" UUID,
  "request_reason" VARCHAR(1000) NOT NULL, "review_reason" VARCHAR(1000),
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewed_at" TIMESTAMPTZ(6),
  CONSTRAINT "badge_approval_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_approval_review_state_check" CHECK (
    ("status" = 'PENDING' AND "reviewed_by_user_id" IS NULL AND "review_reason" IS NULL AND "reviewed_at" IS NULL)
    OR ("status" <> 'PENDING' AND "reviewed_by_user_id" IS NOT NULL AND "review_reason" IS NOT NULL AND "reviewed_at" IS NOT NULL)
  )
);

CREATE TABLE "badge_award_candidates" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL,
  "badge_version_id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "status" "BadgeCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "nominated_by_user_id" UUID NOT NULL, "reviewed_by_user_id" UUID,
  "nomination_reason" VARCHAR(1000) NOT NULL, "review_reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewed_at" TIMESTAMPTZ(6),
  CONSTRAINT "badge_award_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_candidate_separate_reviewer_check" CHECK ("reviewed_by_user_id" IS NULL OR ("reviewed_by_user_id" <> "user_id" AND "reviewed_by_user_id" <> "nominated_by_user_id")),
  CONSTRAINT "badge_candidate_review_state_check" CHECK (
    ("status" = 'PENDING' AND "reviewed_by_user_id" IS NULL AND "review_reason" IS NULL AND "reviewed_at" IS NULL)
    OR ("status" <> 'PENDING' AND "reviewed_by_user_id" IS NOT NULL AND "review_reason" IS NOT NULL AND "reviewed_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "badge_approval_requests_badge_version_id_key" ON "badge_approval_requests"("badge_version_id");
CREATE INDEX "badge_approval_requests_workspace_id_group_id_status_requested_at_idx" ON "badge_approval_requests"("workspace_id", "group_id", "status", "requested_at");
CREATE UNIQUE INDEX "badge_award_candidates_scope_key" ON "badge_award_candidates"("workspace_id", "group_id", "badge_version_id", "user_id");
CREATE INDEX "badge_award_candidates_workspace_id_group_id_status_created_at_idx" ON "badge_award_candidates"("workspace_id", "group_id", "status", "created_at");

ALTER TABLE "badge_approval_requests" ADD CONSTRAINT "badge_approval_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_approval_requests" ADD CONSTRAINT "badge_approval_requests_group_scope_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_approval_requests" ADD CONSTRAINT "badge_approval_requests_badge_version_id_fkey" FOREIGN KEY ("badge_version_id") REFERENCES "badge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_approval_requests" ADD CONSTRAINT "badge_approval_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_approval_requests" ADD CONSTRAINT "badge_approval_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_award_candidates" ADD CONSTRAINT "badge_award_candidates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_award_candidates" ADD CONSTRAINT "badge_award_candidates_group_scope_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_award_candidates" ADD CONSTRAINT "badge_award_candidates_badge_version_id_fkey" FOREIGN KEY ("badge_version_id") REFERENCES "badge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_award_candidates" ADD CONSTRAINT "badge_award_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_award_candidates" ADD CONSTRAINT "badge_award_candidates_nominated_by_user_id_fkey" FOREIGN KEY ("nominated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_award_candidates" ADD CONSTRAINT "badge_award_candidates_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
