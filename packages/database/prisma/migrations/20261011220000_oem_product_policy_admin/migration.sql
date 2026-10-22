BEGIN;
SET LOCAL lock_timeout = '5000ms';
SET LOCAL statement_timeout = '60000ms';
SET LOCAL idle_in_transaction_session_timeout = '60000ms';

ALTER TABLE "commercial_service_products"
  ADD COLUMN "retired_by_user_id" UUID,
  ADD COLUMN "retired_reason" VARCHAR(1000),
  ADD COLUMN "retired_at" TIMESTAMPTZ(6);

ALTER TABLE "commercial_service_products"
  ADD CONSTRAINT "commercial_service_product_retirement_complete"
  CHECK (
    ("status" = 'ACTIVE' AND "retired_by_user_id" IS NULL AND "retired_reason" IS NULL AND "retired_at" IS NULL)
    OR
    ("status" = 'RETIRED' AND "retired_by_user_id" IS NOT NULL AND "retired_reason" IS NOT NULL AND "retired_at" IS NOT NULL)
  );

CREATE FUNCTION "protect_commercial_service_product_retirement"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'RETIRED' AND (
    NEW."status" <> 'RETIRED'
    OR NEW."retired_by_user_id" IS DISTINCT FROM OLD."retired_by_user_id"
    OR NEW."retired_reason" IS DISTINCT FROM OLD."retired_reason"
    OR NEW."retired_at" IS DISTINCT FROM OLD."retired_at"
  ) THEN
    RAISE EXCEPTION 'commercial service product retirement is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "commercial_service_product_retirement_immutable"
  BEFORE UPDATE ON "commercial_service_products"
  FOR EACH ROW EXECUTE FUNCTION "protect_commercial_service_product_retirement"();
COMMIT;
