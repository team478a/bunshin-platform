ALTER TABLE "program_purchases"
ADD COLUMN "refunded_amount_yen" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "program_purchases"
ADD CONSTRAINT "program_purchases_refunded_amount_yen_check"
CHECK (
  "refunded_amount_yen" >= 0
  AND "refunded_amount_yen" <= "amount_yen"
);
