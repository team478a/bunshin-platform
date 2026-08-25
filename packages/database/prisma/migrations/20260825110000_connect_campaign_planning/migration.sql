ALTER TABLE "campaigns"
ADD COLUMN "max_related_per_week" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "max_ads_per_week" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "cooldown_days" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "campaigns"
ADD CONSTRAINT "campaigns_planning_policy_check"
CHECK (
  "max_related_per_week" BETWEEN 0 AND 7
  AND "max_ads_per_week" BETWEEN 0 AND 7
  AND "max_ads_per_week" <= "max_related_per_week"
  AND "cooldown_days" BETWEEN 0 AND 30
);

ALTER TABLE "weekly_plan_items"
ADD COLUMN "campaign_id" UUID,
ADD COLUMN "classification" "AdvertisingClassification" NOT NULL DEFAULT 'ORGANIC';

ALTER TABLE "daily_missions"
ADD COLUMN "campaign_id" UUID,
ADD COLUMN "classification" "AdvertisingClassification" NOT NULL DEFAULT 'ORGANIC';

ALTER TABLE "weekly_plan_items"
ADD CONSTRAINT "weekly_plan_items_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "daily_missions"
ADD CONSTRAINT "daily_missions_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "weekly_plan_items"
ADD CONSTRAINT "weekly_plan_items_campaign_classification_check"
CHECK (("classification" = 'ORGANIC' AND "campaign_id" IS NULL) OR ("classification" <> 'ORGANIC' AND "campaign_id" IS NOT NULL));

ALTER TABLE "daily_missions"
ADD CONSTRAINT "daily_missions_campaign_classification_check"
CHECK (("classification" = 'ORGANIC' AND "campaign_id" IS NULL) OR ("classification" <> 'ORGANIC' AND "campaign_id" IS NOT NULL));

CREATE INDEX "weekly_plan_items_campaign_id_classification_idx"
ON "weekly_plan_items"("campaign_id", "classification");

CREATE INDEX "daily_missions_campaign_id_classification_idx"
ON "daily_missions"("campaign_id", "classification");
