CREATE TYPE "BusinessContentCategory" AS ENUM (
  'HELPFUL_EXPERTISE',
  'COMPANY_STAFF',
  'FAQ_PROBLEM',
  'CASE_STUDY',
  'PRODUCT_SERVICE'
);

ALTER TABLE "service_member_business_profiles"
  ADD COLUMN "website_url" VARCHAR(2048),
  ADD COLUMN "business_features" VARCHAR(1000),
  ADD COLUMN "price_information" VARCHAR(500),
  ADD COLUMN "preferred_tone" VARCHAR(80),
  ADD COLUMN "required_content" VARCHAR(1000),
  ADD COLUMN "forbidden_content" VARCHAR(1000);

ALTER TABLE "weekly_plan_items"
  ADD COLUMN "business_content_category" "BusinessContentCategory";

CREATE INDEX "weekly_plan_items_business_content_category_idx"
  ON "weekly_plan_items"("business_content_category");

-- Existing enterprise daily-delivery services should receive the same complete
-- post format as newly created services after this release.
UPDATE "service_registration_policies"
SET "onboarding_config" = jsonb_set(
  "onboarding_config",
  '{dailyIdeaDelivery,contentMode}',
  '"READY_TO_USE"'::jsonb,
  true
)
WHERE "onboarding_config"->>'businessProfileEnabled' = 'true'
  AND "onboarding_config"->'dailyIdeaDelivery'->>'enabled' = 'true';
