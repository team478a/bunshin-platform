CREATE TABLE "personal_learning_tool_feature_updates" (
  "id" UUID NOT NULL,
  "tool_key" VARCHAR(32) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "summary" VARCHAR(2000) NOT NULL,
  "source_url" VARCHAR(2000) NOT NULL,
  "source_title" VARCHAR(500) NOT NULL,
  "published_at" TIMESTAMPTZ(3),
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "created_by_user_id" UUID NOT NULL,
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "personal_learning_tool_feature_updates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_learning_tool_feature_tool_check" CHECK ("tool_key" IN ('CHATGPT', 'CLAUDE', 'GEMINI', 'CANVA')),
  CONSTRAINT "personal_learning_tool_feature_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  CONSTRAINT "personal_learning_tool_feature_review_check" CHECK (
    ("status" = 'PENDING' AND "reviewed_by_user_id" IS NULL AND "reviewed_at" IS NULL) OR
    ("status" IN ('APPROVED', 'REJECTED', 'EXPIRED') AND "reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
  ),
  CONSTRAINT "personal_learning_tool_feature_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "personal_learning_tool_feature_reviewer_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "personal_learning_tool_feature_tool_source_key"
  ON "personal_learning_tool_feature_updates"("tool_key", "source_url");
CREATE INDEX "personal_learning_tool_feature_status_created_idx"
  ON "personal_learning_tool_feature_updates"("status", "created_at");
CREATE INDEX "personal_learning_tool_feature_tool_status_expiry_idx"
  ON "personal_learning_tool_feature_updates"("tool_key", "status", "expires_at");

CREATE TABLE "personal_learning_tool_feature_audits" (
  "id" UUID NOT NULL,
  "feature_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(16) NOT NULL,
  "reason" VARCHAR(1000),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personal_learning_tool_feature_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_learning_tool_feature_audit_action_check" CHECK ("action" IN ('CREATED', 'APPROVED', 'REJECTED')),
  CONSTRAINT "personal_learning_tool_feature_audit_feature_fk" FOREIGN KEY ("feature_id") REFERENCES "personal_learning_tool_feature_updates"("id") ON DELETE CASCADE,
  CONSTRAINT "personal_learning_tool_feature_audit_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX "personal_learning_tool_feature_audit_feature_time_idx"
  ON "personal_learning_tool_feature_audits"("feature_id", "occurred_at");
CREATE INDEX "personal_learning_tool_feature_audit_actor_time_idx"
  ON "personal_learning_tool_feature_audits"("actor_user_id", "occurred_at");
