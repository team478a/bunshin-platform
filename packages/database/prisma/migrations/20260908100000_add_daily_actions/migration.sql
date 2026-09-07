CREATE TYPE "DailyActionKind" AS ENUM (
  'PHOTO',
  'CUSTOMER_QUESTION',
  'VOICE_MEMO',
  'COMMENT_REPLY',
  'POST_IMPROVEMENT',
  'REST_REASON'
);

CREATE TABLE "daily_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "owner_knowledge_id" UUID NOT NULL,
  "daily_mission_id" UUID,
  "kind" "DailyActionKind" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "content" VARCHAR(20000) NOT NULL,
  "asset_storage_key" VARCHAR(512),
  "asset_mime_type" VARCHAR(120),
  "asset_original_filename" VARCHAR(255),
  "asset_size_bytes" INTEGER,
  "asset_purged_at" TIMESTAMPTZ(6),
  "idempotency_key" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_actions_asset_metadata_check" CHECK (
    ("asset_storage_key" IS NULL AND "asset_mime_type" IS NULL AND "asset_original_filename" IS NULL AND "asset_size_bytes" IS NULL)
    OR
    ("asset_storage_key" IS NOT NULL AND "asset_mime_type" IS NOT NULL AND "asset_original_filename" IS NOT NULL AND "asset_size_bytes" > 0)
  ),
  CONSTRAINT "daily_actions_kind_asset_check" CHECK (
    (("kind" IN ('PHOTO', 'VOICE_MEMO')) AND ("asset_storage_key" IS NOT NULL OR "asset_purged_at" IS NOT NULL))
    OR
    (("kind" NOT IN ('PHOTO', 'VOICE_MEMO')) AND "asset_storage_key" IS NULL AND "asset_purged_at" IS NULL)
  ),
  CONSTRAINT "daily_actions_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_actions_bunshin_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_actions_owner_user_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_actions_owner_knowledge_fkey" FOREIGN KEY ("owner_knowledge_id") REFERENCES "owner_knowledge"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_actions_daily_mission_fkey" FOREIGN KEY ("daily_mission_id") REFERENCES "daily_missions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "daily_actions_owner_user_id_idempotency_key_key"
  ON "daily_actions"("owner_user_id", "idempotency_key");
CREATE INDEX "daily_actions_workspace_id_bunshin_id_created_at_idx"
  ON "daily_actions"("workspace_id", "bunshin_id", "created_at");
CREATE INDEX "daily_actions_owner_knowledge_id_idx"
  ON "daily_actions"("owner_knowledge_id");
