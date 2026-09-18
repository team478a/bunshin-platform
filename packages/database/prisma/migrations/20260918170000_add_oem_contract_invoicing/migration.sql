CREATE TYPE "OrganizationContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED');
CREATE TYPE "TenantInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

CREATE TABLE "organization_commercial_contracts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" "OrganizationContractStatus" NOT NULL DEFAULT 'DRAFT',
    "billing_mode" "ServiceBillingMode" NOT NULL DEFAULT 'MANUAL_INVOICE',
    "billing_name" VARCHAR(200) NOT NULL,
    "billing_email" VARCHAR(320) NOT NULL,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "external_customer_reference" VARCHAR(200),
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_commercial_contracts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_commercial_contracts_payment_terms" CHECK ("payment_terms_days" BETWEEN 0 AND 365),
    CONSTRAINT "organization_commercial_contracts_billing_mode" CHECK ("billing_mode" <> 'FREE'),
    CONSTRAINT "organization_commercial_contracts_period" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "starts_at" < "ends_at")
);

CREATE TABLE "tenant_invoices" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "monthly_usage_id" UUID NOT NULL,
    "invoice_number" VARCHAR(80) NOT NULL,
    "status" "TenantInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "mau" INTEGER NOT NULL,
    "pricing_tier_key" VARCHAR(40) NOT NULL,
    "pricing_version" VARCHAR(80) NOT NULL,
    "amount_yen" INTEGER NOT NULL,
    "external_invoice_reference" VARCHAR(200),
    "payment_reference" VARCHAR(200),
    "notes" VARCHAR(1000),
    "issued_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "voided_at" TIMESTAMPTZ(6),
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_invoices_amount" CHECK ("mau" >= 0 AND "amount_yen" >= 0),
    CONSTRAINT "tenant_invoices_period" CHECK ("period_start" < "period_end"),
    CONSTRAINT "tenant_invoices_status_timestamps" CHECK (
      ("status" = 'DRAFT' AND "issued_at" IS NULL AND "paid_at" IS NULL AND "voided_at" IS NULL) OR
      ("status" = 'ISSUED' AND "issued_at" IS NOT NULL AND "paid_at" IS NULL AND "voided_at" IS NULL) OR
      ("status" = 'PAID' AND "issued_at" IS NOT NULL AND "paid_at" IS NOT NULL AND "voided_at" IS NULL) OR
      ("status" = 'VOID' AND "voided_at" IS NOT NULL AND "paid_at" IS NULL)
    )
);

CREATE TABLE "commercial_billing_audits" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_billing_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_commercial_contracts_workspace_id_key" ON "organization_commercial_contracts"("workspace_id");
CREATE UNIQUE INDEX "organization_commercial_contracts_workspace_id_id_key" ON "organization_commercial_contracts"("workspace_id", "id");
CREATE INDEX "organization_commercial_contracts_status_starts_at_ends_at_idx" ON "organization_commercial_contracts"("status", "starts_at", "ends_at");
CREATE UNIQUE INDEX "tenant_invoices_monthly_usage_id_key" ON "tenant_invoices"("monthly_usage_id");
CREATE UNIQUE INDEX "tenant_invoices_invoice_number_key" ON "tenant_invoices"("invoice_number");
CREATE UNIQUE INDEX "tenant_invoices_workspace_id_id_key" ON "tenant_invoices"("workspace_id", "id");
CREATE UNIQUE INDEX "tenant_invoices_workspace_id_monthly_usage_id_key" ON "tenant_invoices"("workspace_id", "monthly_usage_id");
CREATE INDEX "tenant_invoices_workspace_id_status_period_start_idx" ON "tenant_invoices"("workspace_id", "status", "period_start");
CREATE INDEX "tenant_invoices_status_due_at_idx" ON "tenant_invoices"("status", "due_at");
CREATE INDEX "commercial_billing_audits_workspace_id_occurred_at_idx" ON "commercial_billing_audits"("workspace_id", "occurred_at");
CREATE INDEX "commercial_billing_audits_entity_type_entity_id_occurred_at_idx" ON "commercial_billing_audits"("entity_type", "entity_id", "occurred_at");
CREATE UNIQUE INDEX "tenant_monthly_usage_workspace_id_id_key" ON "tenant_monthly_usage"("workspace_id", "id");

ALTER TABLE "organization_commercial_contracts" ADD CONSTRAINT "organization_commercial_contracts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_commercial_contracts" ADD CONSTRAINT "organization_commercial_contracts_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_invoices" ADD CONSTRAINT "tenant_invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_invoices" ADD CONSTRAINT "tenant_invoices_workspace_id_contract_id_fkey" FOREIGN KEY ("workspace_id", "contract_id") REFERENCES "organization_commercial_contracts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_invoices" ADD CONSTRAINT "tenant_invoices_workspace_id_monthly_usage_id_fkey" FOREIGN KEY ("workspace_id", "monthly_usage_id") REFERENCES "tenant_monthly_usage"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_invoices" ADD CONSTRAINT "tenant_invoices_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_billing_audits" ADD CONSTRAINT "commercial_billing_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_billing_audits" ADD CONSTRAINT "commercial_billing_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_commercial_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_billing_audits" ENABLE ROW LEVEL SECURITY;
