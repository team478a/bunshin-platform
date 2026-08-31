CREATE TABLE "ai_character_audit_logs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID,
  "character_profile_id" UUID NOT NULL,
  "resource_type" VARCHAR(80) NOT NULL,
  "resource_id" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB NOT NULL,
  "performed_by_user_id" UUID NOT NULL,
  "performed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_character_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_character_audit_logs_scope_idx" ON "ai_character_audit_logs"("workspace_id", "group_id", "character_profile_id", "performed_at");
ALTER TABLE "ai_character_audit_logs" ADD CONSTRAINT "ai_character_audit_logs_profile_fkey" FOREIGN KEY ("workspace_id", "character_profile_id") REFERENCES "ai_character_profiles"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_character_audit_logs" ADD CONSTRAINT "ai_character_audit_logs_profile_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "character_profile_id") REFERENCES "ai_character_profiles"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
