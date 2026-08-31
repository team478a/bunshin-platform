CREATE TYPE "CampaignPostingApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');

CREATE TABLE "campaign_posting_approval_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "campaign_posting_approval_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "campaign_posting_approval_policies_group_id_key" ON "campaign_posting_approval_policies"("group_id");
CREATE INDEX "campaign_posting_approval_policies_workspace_id_required_idx" ON "campaign_posting_approval_policies"("workspace_id", "required");
ALTER TABLE "campaign_posting_approval_policies" ADD CONSTRAINT "campaign_posting_approval_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_policies" ADD CONSTRAINT "campaign_posting_approval_policies_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_policies" ADD CONSTRAINT "campaign_posting_approval_policies_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "campaign_posting_approval_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "status" "CampaignPostingApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "request_note" VARCHAR(1000),
  "review_note" VARCHAR(1000),
  "requested_by_user_id" UUID NOT NULL,
  "reviewed_by_user_id" UUID,
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "campaign_posting_approval_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "campaign_posting_approval_requests_daily_mission_id_key" ON "campaign_posting_approval_requests"("daily_mission_id");
CREATE UNIQUE INDEX "campaign_posting_approval_requests_workspace_id_bunshin_id_daily_mission_id_key" ON "campaign_posting_approval_requests"("workspace_id", "bunshin_id", "daily_mission_id");
CREATE INDEX "campaign_posting_approval_requests_workspace_id_group_id_status_requested_at_idx" ON "campaign_posting_approval_requests"("workspace_id", "group_id", "status", "requested_at");
CREATE INDEX "campaign_posting_approval_requests_campaign_id_status_idx" ON "campaign_posting_approval_requests"("campaign_id", "status");
ALTER TABLE "campaign_posting_approval_requests" ADD CONSTRAINT "campaign_posting_approval_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_requests" ADD CONSTRAINT "campaign_posting_approval_requests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_requests" ADD CONSTRAINT "campaign_posting_approval_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_requests" ADD CONSTRAINT "campaign_posting_approval_requests_bunshin_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_requests" ADD CONSTRAINT "campaign_posting_approval_requests_daily_mission_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_requests" ADD CONSTRAINT "campaign_posting_approval_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_requests" ADD CONSTRAINT "campaign_posting_approval_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
