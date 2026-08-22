ALTER TABLE "account_deletion_requests"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lease_owner" VARCHAR(120),
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "processing_started_at" TIMESTAMPTZ(6),
  ADD COLUMN "blocked_reason" VARCHAR(80),
  ADD COLUMN "last_error_category" VARCHAR(80),
  ADD COLUMN "execution_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "summary" JSONB;

ALTER TABLE "account_deletion_requests"
  ADD CONSTRAINT "account_deletion_requests_attempt_count_check" CHECK ("attempt_count" >= 0),
  ADD CONSTRAINT "account_deletion_requests_execution_version_check" CHECK ("execution_version" > 0),
  ADD CONSTRAINT "account_deletion_requests_lease_check" CHECK (
    ("lease_owner" IS NULL AND "lease_expires_at" IS NULL)
    OR ("lease_owner" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "account_deletion_requests_blocked_reason_check" CHECK (
    ("status" = 'BLOCKED' AND "blocked_reason" IS NOT NULL)
    OR ("status" <> 'BLOCKED' AND "blocked_reason" IS NULL)
  );

DROP INDEX "account_deletion_requests_one_requested_per_user";
CREATE UNIQUE INDEX "account_deletion_requests_one_active_per_user"
  ON "account_deletion_requests"("user_id")
  WHERE "status" IN ('REQUESTED', 'PROCESSING', 'BLOCKED');

CREATE INDEX "account_deletion_requests_status_lease_expires_at_idx"
  ON "account_deletion_requests"("status", "lease_expires_at");
