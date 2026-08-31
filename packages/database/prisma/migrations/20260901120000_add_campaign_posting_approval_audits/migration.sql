CREATE TYPE "CampaignPostingApprovalAuditAction" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'CHANGES_REQUESTED',
  'RESUBMITTED',
  'POLICY_UPDATED'
);

CREATE TABLE "campaign_posting_approval_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "request_id" UUID,
  "action" "CampaignPostingApprovalAuditAction" NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "note" VARCHAR(1000),
  "performed_by_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_posting_approval_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "campaign_posting_approval_audits_workspace_id_group_id_occurred_at_idx" ON "campaign_posting_approval_audits"("workspace_id", "group_id", "occurred_at");
CREATE INDEX "campaign_posting_approval_audits_request_id_occurred_at_idx" ON "campaign_posting_approval_audits"("request_id", "occurred_at");
ALTER TABLE "campaign_posting_approval_audits" ADD CONSTRAINT "campaign_posting_approval_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_audits" ADD CONSTRAINT "campaign_posting_approval_audits_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_audits" ADD CONSTRAINT "campaign_posting_approval_audits_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "campaign_posting_approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_posting_approval_audits" ADD CONSTRAINT "campaign_posting_approval_audits_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
