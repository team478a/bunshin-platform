CREATE TABLE "member_product_profiles" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "external_tracking_link_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "appeal_point" VARCHAR(1000) NOT NULL,
    "target_audience" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "member_product_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_product_profiles_workspace_id_group_id_group_membership_id_updated_at_idx"
ON "member_product_profiles"("workspace_id", "group_id", "group_membership_id", "updated_at");

CREATE INDEX "member_product_profiles_external_tracking_link_id_updated_at_idx"
ON "member_product_profiles"("external_tracking_link_id", "updated_at");

ALTER TABLE "member_product_profiles"
ADD CONSTRAINT "member_product_profiles_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_profiles"
ADD CONSTRAINT "member_product_profiles_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_profiles"
ADD CONSTRAINT "member_product_profiles_membership_fkey"
FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_profiles"
ADD CONSTRAINT "member_product_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_product_profiles"
ADD CONSTRAINT "member_product_profiles_external_tracking_link_id_fkey"
FOREIGN KEY ("external_tracking_link_id") REFERENCES "external_tracking_links"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
