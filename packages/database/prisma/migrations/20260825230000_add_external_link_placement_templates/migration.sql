CREATE TYPE "ExternalLinkPlacementTarget" AS ENUM ('BODY', 'CAPTION', 'DESCRIPTION');
CREATE TYPE "ExternalLinkPlacementStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "external_link_placement_templates" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "product_pack_version_id" UUID NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "format" "SocialPreferredFormat" NOT NULL,
  "target" "ExternalLinkPlacementTarget" NOT NULL DEFAULT 'BODY',
  "template" VARCHAR(2000) NOT NULL,
  "url_locked" BOOLEAN NOT NULL DEFAULT true,
  "status" "ExternalLinkPlacementStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "external_link_placement_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_link_placement_templates_version_check" CHECK ("version" >= 1),
  CONSTRAINT "external_link_placement_templates_locked_check" CHECK ("url_locked" = true),
  CONSTRAINT "external_link_placement_templates_marker_check" CHECK (
    (length("template") - length(replace("template", '{{referral_url}}', ''))) / length('{{referral_url}}') = 1
    AND replace("template", '{{referral_url}}', '') NOT LIKE '%{{%'
    AND replace("template", '{{referral_url}}', '') NOT LIKE '%}}%'
  )
);

CREATE UNIQUE INDEX "external_link_placement_templates_product_pack_version_id_platform_format_key"
  ON "external_link_placement_templates"("product_pack_version_id", "platform", "format");
CREATE INDEX "external_link_placement_templates_workspace_id_group_id_status_idx"
  ON "external_link_placement_templates"("workspace_id", "group_id", "status");

ALTER TABLE "external_link_placement_templates"
  ADD CONSTRAINT "external_link_placement_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "external_link_placement_templates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "external_link_placement_templates_product_pack_version_id_fkey" FOREIGN KEY ("product_pack_version_id") REFERENCES "product_pack_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "external_link_placement_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "external_link_placement_templates_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
