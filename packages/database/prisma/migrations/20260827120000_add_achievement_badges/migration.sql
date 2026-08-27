CREATE TABLE "achievement_badges" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "feature_key" VARCHAR(80) NOT NULL,
  "badge_key" VARCHAR(80) NOT NULL,
  "rule_version" INTEGER NOT NULL,
  "label_snapshot" VARCHAR(120) NOT NULL,
  "description_snapshot" VARCHAR(500) NOT NULL,
  "awarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "achievement_badges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "achievement_badges_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "achievement_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "achievement_badges_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "achievement_badges_scope_key" ON "achievement_badges"("workspace_id", "user_id", "bunshin_id", "feature_key", "badge_key", "rule_version");
CREATE INDEX "achievement_badges_scope_awarded_at_idx" ON "achievement_badges"("workspace_id", "user_id", "bunshin_id", "feature_key", "awarded_at");
