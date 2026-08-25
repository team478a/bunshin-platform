CREATE TYPE "CampaignSimilarityVerdict" AS ENUM ('UNIQUE', 'POSSIBLE_DUPLICATE');

ALTER TABLE "campaigns"
  ADD COLUMN "generation_limit_per_participant" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "similarity_threshold_basis_points" INTEGER NOT NULL DEFAULT 8500,
  ADD CONSTRAINT "campaign_generation_limit_check" CHECK ("generation_limit_per_participant" BETWEEN 1 AND 365),
  ADD CONSTRAINT "campaign_similarity_threshold_check" CHECK ("similarity_threshold_basis_points" BETWEEN 7000 AND 10000);

CREATE TABLE "campaign_similarity_reviews" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "daily_mission_id" UUID,
  "participant_workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "content_fingerprint" CHAR(64) NOT NULL,
  "simhash" CHAR(16) NOT NULL,
  "max_similarity_basis_points" INTEGER NOT NULL,
  "verdict" "CampaignSimilarityVerdict" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_similarity_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_similarity_score_check" CHECK ("max_similarity_basis_points" BETWEEN 0 AND 10000)
);

CREATE UNIQUE INDEX "campaign_similarity_reviews_daily_mission_id_key" ON "campaign_similarity_reviews"("daily_mission_id");
CREATE INDEX "campaign_similarity_reviews_campaign_id_created_at_idx" ON "campaign_similarity_reviews"("campaign_id", "created_at");
CREATE INDEX "campaign_similarity_reviews_campaign_id_verdict_idx" ON "campaign_similarity_reviews"("campaign_id", "verdict");

ALTER TABLE "campaign_similarity_reviews" ADD CONSTRAINT "campaign_similarity_reviews_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_similarity_reviews" ADD CONSTRAINT "campaign_similarity_reviews_daily_mission_id_fkey" FOREIGN KEY ("daily_mission_id") REFERENCES "daily_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_similarity_reviews" ADD CONSTRAINT "campaign_similarity_reviews_participant_workspace_id_fkey" FOREIGN KEY ("participant_workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_similarity_reviews" ADD CONSTRAINT "campaign_similarity_reviews_participant_workspace_id_bunshin_id_fkey" FOREIGN KEY ("participant_workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
