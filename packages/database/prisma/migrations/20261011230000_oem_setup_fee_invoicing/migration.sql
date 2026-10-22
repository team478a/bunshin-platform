BEGIN;
SET LOCAL lock_timeout = '5000ms';
SET LOCAL statement_timeout = '60000ms';
SET LOCAL idle_in_transaction_session_timeout = '60000ms';

CREATE TYPE "TenantInvoiceKind" AS ENUM ('MONTHLY_USAGE', 'SETUP_FEE');

CREATE TABLE "oem_setup_fee_charges" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "charge_key" VARCHAR(80) NOT NULL,
  "amount_yen" INTEGER NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "agreement_reference" VARCHAR(200) NOT NULL,
  "agreed_at" DATE NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oem_setup_fee_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oem_setup_fee_charges_amount" CHECK ("amount_yen" > 0 AND "amount_yen" <= 1000000000),
  CONSTRAINT "oem_setup_fee_charges_required_text" CHECK (
    "charge_key" ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    AND length(btrim("description")) > 0
    AND length(btrim("agreement_reference")) > 0
    AND length(btrim("reason")) >= 10
  )
);

CREATE UNIQUE INDEX "oem_setup_fee_charges_workspace_id_product_id_charge_key_key"
  ON "oem_setup_fee_charges"("workspace_id", "product_id", "charge_key");
CREATE UNIQUE INDEX "oem_setup_fee_charges_workspace_id_id_key"
  ON "oem_setup_fee_charges"("workspace_id", "id");
CREATE INDEX "oem_setup_fee_charges_workspace_id_agreed_at_idx"
  ON "oem_setup_fee_charges"("workspace_id", "agreed_at");
CREATE INDEX "oem_setup_fee_charges_product_id_agreed_at_idx"
  ON "oem_setup_fee_charges"("product_id", "agreed_at");

ALTER TABLE "oem_setup_fee_charges"
  ADD CONSTRAINT "oem_setup_fee_charges_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "oem_setup_fee_charges_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "commercial_service_products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "oem_setup_fee_charges_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "tenant_invoices"
  ADD COLUMN "kind" "TenantInvoiceKind" NOT NULL DEFAULT 'MONTHLY_USAGE',
  ADD COLUMN "setup_fee_charge_id" UUID,
  ALTER COLUMN "monthly_usage_id" DROP NOT NULL;

CREATE UNIQUE INDEX "tenant_invoices_setup_fee_charge_id_key"
  ON "tenant_invoices"("setup_fee_charge_id");
CREATE UNIQUE INDEX "tenant_invoices_workspace_id_setup_fee_charge_id_key"
  ON "tenant_invoices"("workspace_id", "setup_fee_charge_id");

ALTER TABLE "tenant_invoices"
  ADD CONSTRAINT "tenant_invoices_source_kind" CHECK (
    ("kind" = 'MONTHLY_USAGE' AND "monthly_usage_id" IS NOT NULL AND "setup_fee_charge_id" IS NULL)
    OR
    ("kind" = 'SETUP_FEE' AND "monthly_usage_id" IS NULL AND "setup_fee_charge_id" IS NOT NULL
      AND "mau" = 0 AND "billable_user_count" IS NULL AND "billing_rule_version" IS NULL
      AND "pricing_schedule_id" IS NULL)
  ),
  ADD CONSTRAINT "tenant_invoices_workspace_id_setup_fee_charge_id_fkey"
  FOREIGN KEY ("workspace_id", "setup_fee_charge_id")
  REFERENCES "oem_setup_fee_charges"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "oem_setup_fee_charges" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION "protect_oem_setup_fee_charge"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'OEM setup fee charge is immutable';
END;
$$;

CREATE TRIGGER "oem_setup_fee_charge_immutable"
BEFORE UPDATE OR DELETE ON "oem_setup_fee_charges"
FOR EACH ROW EXECUTE FUNCTION "protect_oem_setup_fee_charge"();
COMMIT;
