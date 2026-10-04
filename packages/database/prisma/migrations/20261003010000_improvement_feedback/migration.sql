CREATE TABLE "improvement_feedback" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "package_key" VARCHAR(30) NOT NULL,
  "submission_key" UUID NOT NULL,
  "category" VARCHAR(20) NOT NULL,
  "surface" VARCHAR(20) NOT NULL,
  "impact" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "improvement_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "improvement_feedback_scope_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "improvement_feedback_values_check" CHECK (
    "package_key" = 'SOCIAL' AND
    "category" IN ('OPERATION', 'CONTENT', 'WAITING', 'OTHER') AND
    "surface" IN ('SETUP', 'TODAY', 'PHOTO', 'VIDEO', 'NOTIFICATION', 'OTHER') AND
    "impact" IN ('BLOCKED', 'DIFFICULT', 'SUGGESTION')
  )
);
CREATE UNIQUE INDEX "improvement_feedback_submission_key" ON "improvement_feedback"("workspace_id", "actor_user_id", "submission_key");
CREATE INDEX "improvement_feedback_scope_time" ON "improvement_feedback"("workspace_id", "service_id", "package_key", "created_at");
ALTER TABLE "improvement_feedback" ENABLE ROW LEVEL SECURITY;
