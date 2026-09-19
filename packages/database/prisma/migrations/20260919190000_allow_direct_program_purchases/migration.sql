ALTER TABLE "program_purchases"
  ALTER COLUMN "source_enrollment_id" DROP NOT NULL;

CREATE UNIQUE INDEX "program_purchases_one_unsettled_direct_product_key"
  ON "program_purchases" ("workspace_id", "group_id", "buyer_user_id", "program_offering_id")
  WHERE "source_enrollment_id" IS NULL
    AND "status" IN ('CREATED', 'CHECKOUT_OPEN', 'PAID');
