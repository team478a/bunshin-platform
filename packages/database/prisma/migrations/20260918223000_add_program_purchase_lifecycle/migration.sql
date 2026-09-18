ALTER TABLE "program_purchases"
  ADD COLUMN "expired_at" TIMESTAMPTZ(6),
  ADD COLUMN "refunded_at" TIMESTAMPTZ(6);

CREATE INDEX "program_purchases_status_checkout_expires_at_idx"
  ON "program_purchases"("status", "checkout_expires_at");

CREATE UNIQUE INDEX "program_purchases_workspace_id_group_id_paid_enrollment_id_key"
  ON "program_purchases"("workspace_id", "group_id", "paid_enrollment_id");

ALTER TABLE "program_purchases"
  ADD CONSTRAINT "program_purchases_paid_enrollment_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "paid_enrollment_id")
  REFERENCES "program_enrollments"("workspace_id", "group_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "program_purchases"
  ADD CONSTRAINT "program_purchases_lifecycle_timestamps_check" CHECK (
    ("status" <> 'EXPIRED' OR "expired_at" IS NOT NULL) AND
    ("status" <> 'REFUNDED' OR "refunded_at" IS NOT NULL)
  );
