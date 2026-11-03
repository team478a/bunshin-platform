-- Legacy rows remain UNKNOWN. Never infer user activity from actor IDs or operation types.
ALTER TABLE "daily_mission_generations"
  ADD COLUMN "generation_trigger" VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  ADD CONSTRAINT "daily_mission_generations_trigger_check"
    CHECK ("generation_trigger" IN ('USER', 'SCHEDULER', 'SYSTEM', 'UNKNOWN'));

ALTER TABLE "mission_content_variant_generations"
  ADD COLUMN "generation_trigger" VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  ADD CONSTRAINT "mission_content_variant_generations_trigger_check"
    CHECK ("generation_trigger" IN ('USER', 'SCHEDULER', 'SYSTEM', 'UNKNOWN'));
