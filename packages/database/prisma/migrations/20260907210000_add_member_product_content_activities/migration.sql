CREATE TYPE "MemberProductContentActivityType" AS ENUM ('GENERATED', 'COPIED', 'POSTED');

CREATE UNIQUE INDEX "external_tracking_links_workspace_id_group_id_id_key"
ON "external_tracking_links"("workspace_id", "group_id", "id");

CREATE UNIQUE INDEX "member_product_profiles_workspace_id_group_id_id_key"
ON "member_product_profiles"("workspace_id", "group_id", "id");

CREATE TABLE "member_product_content_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "member_product_profile_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "external_tracking_link_id" UUID NOT NULL,
  "generation_id" UUID NOT NULL,
  "type" "MemberProductContentActivityType" NOT NULL,
  "platform" VARCHAR(20) NOT NULL,
  "candidate_index" INTEGER,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "member_product_content_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "member_product_content_activities_candidate_index_check"
    CHECK ("candidate_index" IS NULL OR ("candidate_index" >= 0 AND "candidate_index" <= 2)),
  CONSTRAINT "member_product_content_activities_candidate_type_check"
    CHECK (("type" = 'GENERATED' AND "candidate_index" IS NULL) OR ("type" <> 'GENERATED' AND "candidate_index" IS NOT NULL))
);

CREATE UNIQUE INDEX "member_product_content_activities_group_membership_id_generation_id_type_key"
ON "member_product_content_activities"("group_membership_id", "generation_id", "type");

CREATE INDEX "member_product_content_activities_workspace_id_group_id_member_product_profile_id_occurred_at_idx"
ON "member_product_content_activities"("workspace_id", "group_id", "member_product_profile_id", "occurred_at");

CREATE INDEX "member_product_content_activities_workspace_id_group_id_user_id_occurred_at_idx"
ON "member_product_content_activities"("workspace_id", "group_id", "user_id", "occurred_at");

CREATE INDEX "member_product_content_activities_external_tracking_link_id_occurred_at_idx"
ON "member_product_content_activities"("external_tracking_link_id", "occurred_at");

ALTER TABLE "member_product_content_activities"
ADD CONSTRAINT "member_product_content_activities_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_content_activities"
ADD CONSTRAINT "member_product_content_activities_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_content_activities"
ADD CONSTRAINT "member_product_content_activities_membership_fkey"
FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_content_activities"
ADD CONSTRAINT "member_product_content_activities_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_content_activities"
ADD CONSTRAINT "member_product_content_activities_profile_fkey"
FOREIGN KEY ("workspace_id", "group_id", "member_product_profile_id")
REFERENCES "member_product_profiles"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_content_activities"
ADD CONSTRAINT "member_product_content_activities_bunshin_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_content_activities"
ADD CONSTRAINT "member_product_content_activities_external_link_fkey"
FOREIGN KEY ("workspace_id", "group_id", "external_tracking_link_id")
REFERENCES "external_tracking_links"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
