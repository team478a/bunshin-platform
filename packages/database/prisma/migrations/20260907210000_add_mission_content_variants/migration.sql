CREATE TYPE "MissionContentVariantGenerationStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "mission_content_variants" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "bunshin_id" UUID NOT NULL,
    "daily_mission_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "format" "SocialPreferredFormat" NOT NULL,
    "content_json" JSONB NOT NULL,
    "quality_score" INTEGER NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "prompt_version" VARCHAR(120) NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost_micros" BIGINT,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mission_content_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mission_content_variant_generations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "bunshin_id" UUID NOT NULL,
    "daily_mission_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "status" "MissionContentVariantGenerationStatus" NOT NULL DEFAULT 'PROCESSING',
    "variant_id" UUID,
    "model" VARCHAR(120),
    "prompt_version" VARCHAR(120),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost_micros" BIGINT,
    "latency_ms" INTEGER,
    "error_category" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "mission_content_variant_generations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mission_content_variant_selections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "bunshin_id" UUID NOT NULL,
    "daily_mission_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "selected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mission_content_variant_selections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mission_content_variants_sequence_key" ON "mission_content_variants"("workspace_id", "bunshin_id", "daily_mission_id", "sequence");
CREATE UNIQUE INDEX "mission_content_variants_scope_id_key" ON "mission_content_variants"("workspace_id", "bunshin_id", "daily_mission_id", "id");
CREATE INDEX "mission_content_variants_mission_created_idx" ON "mission_content_variants"("workspace_id", "bunshin_id", "daily_mission_id", "created_at");
CREATE UNIQUE INDEX "mission_content_variant_generations_variant_id_key" ON "mission_content_variant_generations"("variant_id");
CREATE UNIQUE INDEX "mission_content_variant_generations_idempotency_key" ON "mission_content_variant_generations"("workspace_id", "bunshin_id", "actor_user_id", "idempotency_key");
CREATE UNIQUE INDEX "mission_content_variant_generations_variant_scope_key" ON "mission_content_variant_generations"("workspace_id", "bunshin_id", "daily_mission_id", "variant_id");
CREATE UNIQUE INDEX "mission_content_variant_generations_scope_id_key" ON "mission_content_variant_generations"("workspace_id", "bunshin_id", "daily_mission_id", "id");
CREATE INDEX "mission_content_variant_generations_status_idx" ON "mission_content_variant_generations"("workspace_id", "bunshin_id", "daily_mission_id", "status", "updated_at");
CREATE UNIQUE INDEX "mission_content_variant_selections_idempotency_key" ON "mission_content_variant_selections"("workspace_id", "bunshin_id", "actor_user_id", "idempotency_key");
CREATE INDEX "mission_content_variant_selections_latest_idx" ON "mission_content_variant_selections"("workspace_id", "bunshin_id", "daily_mission_id", "selected_at");

ALTER TABLE "mission_content_variants" ADD CONSTRAINT "mission_content_variants_mission_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id", "format") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id", "format") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_content_variant_generations" ADD CONSTRAINT "mission_content_variant_generations_mission_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_content_variant_generations" ADD CONSTRAINT "mission_content_variant_generations_variant_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id", "variant_id") REFERENCES "mission_content_variants"("workspace_id", "bunshin_id", "daily_mission_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_content_variant_selections" ADD CONSTRAINT "mission_content_variant_selections_mission_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_content_variant_selections" ADD CONSTRAINT "mission_content_variant_selections_variant_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id", "variant_id") REFERENCES "mission_content_variants"("workspace_id", "bunshin_id", "daily_mission_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
