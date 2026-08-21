CREATE TYPE "AccountDeletionRequestStatus" AS ENUM ('REQUESTED', 'CANCELLED', 'COMPLETED');
CREATE TABLE "account_deletion_requests" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "status" "AccountDeletionRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
  "cancelled_at" TIMESTAMPTZ(6), "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "account_deletion_requests_user_id_status_requested_at_idx" ON "account_deletion_requests"("user_id", "status", "requested_at");
CREATE INDEX "account_deletion_requests_status_scheduled_for_idx" ON "account_deletion_requests"("status", "scheduled_for");
CREATE UNIQUE INDEX "account_deletion_requests_one_requested_per_user" ON "account_deletion_requests"("user_id") WHERE "status" = 'REQUESTED';
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
