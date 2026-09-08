CREATE TABLE "social_image_samples" (
 "id" UUID PRIMARY KEY,
 "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 "group_id" UUID NOT NULL REFERENCES "groups"("id") ON DELETE RESTRICT,
 "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "bunshin_id" UUID NOT NULL REFERENCES "bunshins"("id") ON DELETE RESTRICT,
 "input_hash" CHAR(64) NOT NULL,
 "layout" JSONB NOT NULL,
 "art_direction" VARCHAR(1000) NOT NULL,
 "model" VARCHAR(120) NOT NULL,
 "status" VARCHAR(20) NOT NULL CHECK ("status" IN ('GENERATING', 'READY', 'FAILED', 'DELETED')),
 "error_code" VARCHAR(80),
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "social_image_samples_group_id_created_at_idx" ON "social_image_samples"("group_id", "created_at");
CREATE INDEX "social_image_samples_owner_user_id_created_at_idx" ON "social_image_samples"("owner_user_id", "created_at");
ALTER TABLE "social_image_samples" ENABLE ROW LEVEL SECURITY;
