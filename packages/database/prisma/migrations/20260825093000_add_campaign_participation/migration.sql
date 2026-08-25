CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE "CampaignParticipationStatus" AS ENUM ('ACCEPTED', 'DECLINED', 'ON_HOLD', 'WITHDRAWN');
CREATE TYPE "CampaignActivityAction" AS ENUM ('CREATED', 'OPENED', 'CLOSED', 'CANCELLED', 'ACCEPTED', 'DECLINED', 'HELD', 'WITHDRAWN');

CREATE TABLE "campaigns" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "product_pack_version_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "theme" VARCHAR(1000) NOT NULL,
  "target_summary" VARCHAR(1000) NOT NULL,
  "participation_limit" INTEGER NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL,
  "opened_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_period_check" CHECK ("starts_at" < "ends_at"),
  CONSTRAINT "campaign_limit_check" CHECK ("participation_limit" > 0)
);

CREATE TABLE "campaign_assets" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "product_pack_asset_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_participations" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "participant_workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "status" "CampaignParticipationStatus" NOT NULL,
  "consented_at" TIMESTAMPTZ(6),
  "declined_at" TIMESTAMPTZ(6),
  "held_at" TIMESTAMPTZ(6),
  "withdrawn_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "campaign_participations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_activities" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" "CampaignActivityAction" NOT NULL,
  "from_status" VARCHAR(40),
  "to_status" VARCHAR(40) NOT NULL,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campaigns_workspace_id_status_starts_at_ends_at_idx" ON "campaigns"("workspace_id", "status", "starts_at", "ends_at");
CREATE INDEX "campaigns_group_id_status_idx" ON "campaigns"("group_id", "status");
CREATE UNIQUE INDEX "campaign_assets_campaign_id_product_pack_asset_id_key" ON "campaign_assets"("campaign_id", "product_pack_asset_id");
CREATE UNIQUE INDEX "campaign_participations_campaign_id_user_id_key" ON "campaign_participations"("campaign_id", "user_id");
CREATE INDEX "campaign_participations_participant_workspace_id_user_id_status_idx" ON "campaign_participations"("participant_workspace_id", "user_id", "status");
CREATE INDEX "campaign_participations_campaign_id_status_idx" ON "campaign_participations"("campaign_id", "status");
CREATE INDEX "campaign_activities_campaign_id_created_at_idx" ON "campaign_activities"("campaign_id", "created_at");

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_product_pack_version_id_fkey" FOREIGN KEY ("product_pack_version_id") REFERENCES "product_pack_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_assets" ADD CONSTRAINT "campaign_assets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_assets" ADD CONSTRAINT "campaign_assets_product_pack_asset_id_fkey" FOREIGN KEY ("product_pack_asset_id") REFERENCES "product_pack_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_participations" ADD CONSTRAINT "campaign_participations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_participations" ADD CONSTRAINT "campaign_participations_participant_workspace_id_fkey" FOREIGN KEY ("participant_workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_participations" ADD CONSTRAINT "campaign_participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_participations" ADD CONSTRAINT "campaign_participations_participant_workspace_id_bunshin_id_fkey" FOREIGN KEY ("participant_workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_activities" ADD CONSTRAINT "campaign_activities_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_activities" ADD CONSTRAINT "campaign_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
