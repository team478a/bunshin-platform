ALTER TYPE "ExternalTrackingAuditAction" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "member_product_profiles"
ADD COLUMN "archived_at" TIMESTAMPTZ(6);

DROP INDEX "member_product_profiles_workspace_id_group_id_group_membership_id_updated_at_idx";

CREATE INDEX "member_product_profiles_workspace_id_group_id_group_membership_id_archived_at_updated_at_idx"
ON "member_product_profiles"("workspace_id", "group_id", "group_membership_id", "archived_at", "updated_at");
