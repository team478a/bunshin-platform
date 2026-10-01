-- Keep the source photo and structured Photo First plan tenant-scoped and atomic with its variant.
CREATE UNIQUE INDEX "bunshin_memories_scope_id_key"
ON "bunshin_memories"("workspace_id", "bunshin_id", "id");

CREATE TABLE "mission_content_variant_photo_first_metadata" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "bunshin_id" UUID NOT NULL,
    "daily_mission_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "photo_memory_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "analysis_json" JSONB NOT NULL,
    "planning_json" JSONB NOT NULL,
    "analyzer_model" VARCHAR(120) NOT NULL,
    "analyzer_prompt_version" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_content_variant_photo_first_metadata_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "mission_content_variant_photo_first_metadata" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "mission_content_variant_photo_first_metadata_variant_id_key"
ON "mission_content_variant_photo_first_metadata"("variant_id");

CREATE UNIQUE INDEX "mission_variant_photo_first_scope_key"
ON "mission_content_variant_photo_first_metadata"("workspace_id", "bunshin_id", "daily_mission_id", "variant_id");

CREATE INDEX "mission_variant_photo_first_memory_idx"
ON "mission_content_variant_photo_first_metadata"("workspace_id", "bunshin_id", "photo_memory_id");

CREATE INDEX "mission_variant_photo_first_mission_idx"
ON "mission_content_variant_photo_first_metadata"("workspace_id", "bunshin_id", "daily_mission_id", "created_at");

ALTER TABLE "mission_content_variant_photo_first_metadata"
ADD CONSTRAINT "mission_variant_photo_first_variant_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id", "variant_id")
REFERENCES "mission_content_variants"("workspace_id", "bunshin_id", "daily_mission_id", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mission_content_variant_photo_first_metadata"
ADD CONSTRAINT "mission_variant_photo_first_memory_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id", "photo_memory_id")
REFERENCES "bunshin_memories"("workspace_id", "bunshin_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
