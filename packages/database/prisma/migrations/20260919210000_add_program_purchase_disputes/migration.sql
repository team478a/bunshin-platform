ALTER TYPE "ProgramPurchaseStatus" ADD VALUE 'DISPUTED';
ALTER TYPE "ProgramPurchaseStatus" ADD VALUE 'CHARGEBACK_LOST';

ALTER TABLE "program_purchases"
  ADD COLUMN "disputed_amount_yen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "provider_dispute_id" VARCHAR(200),
  ADD COLUMN "dispute_status" VARCHAR(40),
  ADD COLUMN "enrollment_status_before_dispute" "ProgramEnrollmentStatus",
  ADD COLUMN "disputed_at" TIMESTAMPTZ(6),
  ADD COLUMN "dispute_resolved_at" TIMESTAMPTZ(6);

ALTER TABLE "program_purchases"
  ADD CONSTRAINT "program_purchases_disputed_amount_yen_check"
  CHECK ("disputed_amount_yen" >= 0 AND "disputed_amount_yen" <= "amount_yen");

CREATE INDEX "program_purchases_payment_configuration_id_provider_dispute_id_idx"
  ON "program_purchases"("payment_configuration_id", "provider_dispute_id");

DROP INDEX "program_purchases_one_unsettled_direct_product_key";
CREATE UNIQUE INDEX "program_purchases_one_unsettled_direct_product_key"
  ON "program_purchases" ("workspace_id", "group_id", "buyer_user_id", "program_offering_id")
  WHERE "source_enrollment_id" IS NULL
    AND "status" IN ('CREATED', 'CHECKOUT_OPEN', 'PAID', 'DISPUTED');
