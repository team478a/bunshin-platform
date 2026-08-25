ALTER TABLE "product_pack_versions"
  ADD COLUMN "allow_linkless_posts" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "content_link_usages" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "product_pack_id" UUID NOT NULL,
  "product_pack_version_id" UUID NOT NULL,
  "campaign_id" UUID,
  "external_tracking_link_id" UUID NOT NULL,
  "placement_template_id" UUID,
  "inserted_url_snapshot" VARCHAR(2048) NOT NULL,
  "link_name_snapshot" VARCHAR(160) NOT NULL,
  "expires_at_snapshot" TIMESTAMPTZ(6),
  "placement_template_version" INTEGER,
  "advertising_classification" "AdvertisingClassification" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_link_usages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_link_usages_placement_version_check" CHECK ("placement_template_version" IS NULL OR "placement_template_version" >= 1)
);

CREATE UNIQUE INDEX "content_link_usages_daily_mission_id_key" ON "content_link_usages"("daily_mission_id");
CREATE UNIQUE INDEX "content_link_usages_workspace_id_bunshin_id_daily_mission_id_key" ON "content_link_usages"("workspace_id", "bunshin_id", "daily_mission_id");
CREATE INDEX "content_link_usages_group_id_group_membership_id_created_at_idx" ON "content_link_usages"("group_id", "group_membership_id", "created_at");
CREATE INDEX "content_link_usages_product_pack_id_campaign_id_created_at_idx" ON "content_link_usages"("product_pack_id", "campaign_id", "created_at");
CREATE INDEX "content_link_usages_external_tracking_link_id_created_at_idx" ON "content_link_usages"("external_tracking_link_id", "created_at");

ALTER TABLE "content_link_usages"
  ADD CONSTRAINT "content_link_usages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_workspace_id_bunshin_id_daily_mission_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_group_membership_id_fkey" FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_product_pack_id_fkey" FOREIGN KEY ("product_pack_id") REFERENCES "product_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_product_pack_version_id_fkey" FOREIGN KEY ("product_pack_version_id") REFERENCES "product_pack_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_external_tracking_link_id_fkey" FOREIGN KEY ("external_tracking_link_id") REFERENCES "external_tracking_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "content_link_usages_placement_template_id_fkey" FOREIGN KEY ("placement_template_id") REFERENCES "external_link_placement_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
