ALTER TYPE "AiProviderKey" ADD VALUE IF NOT EXISTS 'XAI';

CREATE TYPE "AiProviderCapabilityKey" AS ENUM (
  'GENERAL',
  'SOCIAL_IMAGE_GENERATION',
  'VIDEO_SCENE_GENERATION'
);

ALTER TABLE "ai_provider_configurations"
  ADD COLUMN "capability_key" "AiProviderCapabilityKey" NOT NULL DEFAULT 'GENERAL';

UPDATE "ai_provider_configurations"
SET "capability_key" = 'VIDEO_SCENE_GENERATION'
WHERE "provider" IN ('FAL', 'RUNWAY');

DROP INDEX "ai_provider_configurations_environment_provider_version_key";
DROP INDEX "ai_provider_configurations_one_active_per_environment_provider";

CREATE UNIQUE INDEX "ai_provider_configurations_environment_provider_capability_version_key"
  ON "ai_provider_configurations"("environment", "provider", "capability_key", "version");

CREATE UNIQUE INDEX "ai_provider_configurations_one_active_per_environment_provider_capability"
  ON "ai_provider_configurations"("environment", "provider", "capability_key")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "social_image_generation_pilots"
  ADD COLUMN "asset_provider" "AiProviderKey" NOT NULL DEFAULT 'OPENAI';

ALTER TABLE "social_image_generation_requests"
  ADD COLUMN "asset_provider" "AiProviderKey",
  ADD COLUMN "asset_model" VARCHAR(120),
  ADD COLUMN "asset_quality" VARCHAR(40),
  ADD COLUMN "provider_configuration_id" UUID;

UPDATE "social_image_generation_requests" AS request
SET
  "asset_provider" = pilot."asset_provider",
  "asset_model" = pilot."default_model",
  "asset_quality" = pilot."default_quality"
FROM "social_image_pilot_enrollments" AS enrollment
JOIN "social_image_generation_pilots" AS pilot ON pilot."id" = enrollment."pilot_id"
WHERE request."pilot_enrollment_id" = enrollment."id";

ALTER TABLE "social_image_generation_requests"
  ALTER COLUMN "asset_provider" SET NOT NULL,
  ALTER COLUMN "asset_provider" SET DEFAULT 'OPENAI',
  ALTER COLUMN "asset_model" SET NOT NULL,
  ALTER COLUMN "asset_quality" SET NOT NULL;

ALTER TABLE "social_image_generation_requests"
  ADD CONSTRAINT "social_image_generation_requests_provider_configuration_id_fkey"
  FOREIGN KEY ("provider_configuration_id") REFERENCES "ai_provider_configurations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "social_image_generation_requests_provider_configuration_id_idx"
  ON "social_image_generation_requests"("provider_configuration_id");
