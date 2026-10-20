CREATE TABLE "ops_morning_digest_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "environment" VARCHAR(16) NOT NULL,
  "target_date" DATE NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "lease_expires_at" TIMESTAMPTZ(6),
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "error_category" VARCHAR(80),
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ops_morning_digest_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ops_morning_digest_runs_environment_check" CHECK ("environment" IN ('DEVELOPMENT', 'STAGING', 'PRODUCTION')),
  CONSTRAINT "ops_morning_digest_runs_status_check" CHECK ("status" IN ('CLAIMED', 'SENT', 'FAILED')),
  CONSTRAINT "ops_morning_digest_runs_attempt_count_check" CHECK ("attempt_count" > 0),
  CONSTRAINT "ops_morning_digest_runs_state_consistency_check" CHECK (
    ("status" = 'CLAIMED' AND "lease_expires_at" IS NOT NULL AND "sent_at" IS NULL AND "error_category" IS NULL)
    OR ("status" = 'SENT' AND "lease_expires_at" IS NULL AND "sent_at" IS NOT NULL AND "error_category" IS NULL)
    OR ("status" = 'FAILED' AND "lease_expires_at" IS NULL AND "sent_at" IS NULL AND "error_category" IS NOT NULL)
  ),
  CONSTRAINT "ops_morning_digest_runs_environment_target_date_key" UNIQUE ("environment", "target_date")
);

CREATE INDEX "ops_morning_digest_runs_environment_created_at_idx"
  ON "ops_morning_digest_runs"("environment", "created_at");

ALTER TABLE "ops_morning_digest_runs" ENABLE ROW LEVEL SECURITY;
