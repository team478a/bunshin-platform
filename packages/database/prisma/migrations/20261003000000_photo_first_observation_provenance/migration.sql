-- Old rows remain unknown; no inferred backfill.
ALTER TABLE "mission_content_variant_generations"
  ADD COLUMN "initiating_source" VARCHAR(20),
  ADD CONSTRAINT "mission_variant_source_check"
    CHECK ("initiating_source" IS NULL OR "initiating_source" IN ('STANDARD', 'PHOTO_FIRST'));

ALTER TABLE "ai_usage_events" ADD COLUMN "content_variant_generation_id" UUID;
CREATE INDEX "ai_usage_events_content_variant_generation_id_idx"
  ON "ai_usage_events"("content_variant_generation_id");
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_content_variant_generation_id_fkey"
  FOREIGN KEY ("content_variant_generation_id") REFERENCES "mission_content_variant_generations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
