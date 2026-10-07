-- DropIndex
DROP INDEX "commercial_pricing_schedules_effective_from_key";

-- AlterTable
ALTER TABLE "tenant_monthly_usage" ADD COLUMN     "billable_user_count" INTEGER,
ADD COLUMN     "billing_evidence" JSONB,
ADD COLUMN     "billing_rule_version" VARCHAR(80),
ADD COLUMN     "free_active_user_count" INTEGER,
ADD COLUMN     "overlap_user_count" INTEGER,
ADD COLUMN     "pricing_schedule_id" UUID,
ADD COLUMN     "registered_user_count" INTEGER;

-- AlterTable
ALTER TABLE "commercial_pricing_schedules" ADD COLUMN     "change_reason" VARCHAR(1000) NOT NULL DEFAULT 'legacy schedule',
ADD COLUMN     "name" VARCHAR(120) NOT NULL DEFAULT 'OEM料金表',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED';

-- AlterTable
ALTER TABLE "tenant_invoices" ADD COLUMN     "billable_user_count" INTEGER,
ADD COLUMN     "billing_rule_version" VARCHAR(80),
ADD COLUMN     "pricing_schedule_id" UUID;

-- CreateTable
CREATE TABLE "commercial_pricing_audits" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_pricing_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oem_billing_policies" (
    "workspace_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "rule_version" VARCHAR(80) NOT NULL,
    "history_ready_at" TIMESTAMPTZ(6),
    "actor_user_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,

    CONSTRAINT "oem_billing_policies_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "oem_registration_periods" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "registered_by_user_id" UUID NOT NULL,
    "ended_by_user_id" UUID,
    "reason" VARCHAR(1000) NOT NULL,
    "end_reason" VARCHAR(1000),

    CONSTRAINT "oem_registration_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oem_offering_periods" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "product_policy" VARCHAR(40) NOT NULL,
    "classification" VARCHAR(20) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "actor_user_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,

    CONSTRAINT "oem_offering_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oem_contract_periods" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "actor_user_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,

    CONSTRAINT "oem_contract_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_pricing_audits_schedule_id_occurred_at_idx" ON "commercial_pricing_audits"("schedule_id", "occurred_at");

-- CreateIndex
CREATE INDEX "oem_registration_periods_workspace_id_starts_at_ends_at_idx" ON "oem_registration_periods"("workspace_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "oem_registration_periods_group_membership_id_starts_at_key" ON "oem_registration_periods"("group_membership_id", "starts_at");

-- CreateIndex
CREATE INDEX "oem_offering_periods_workspace_id_starts_at_ends_at_idx" ON "oem_offering_periods"("workspace_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "oem_offering_periods_workspace_id_group_id_starts_at_key" ON "oem_offering_periods"("workspace_id", "group_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "oem_contract_periods_workspace_id_starts_at_key" ON "oem_contract_periods"("workspace_id", "starts_at");


-- Replace only the old scheduling constraint, never the finalized snapshot trigger.
CREATE UNIQUE INDEX "commercial_pricing_one_published_month" ON "commercial_pricing_schedules"("effective_from") WHERE "status" = 'PUBLISHED';
ALTER TABLE "commercial_pricing_schedules" ADD CONSTRAINT "commercial_pricing_status" CHECK ("status" IN ('DRAFT','PUBLISHED','CANCELLED') AND "revision" > 0 AND extract(day from "effective_from") = 1);
CREATE UNIQUE INDEX "oem_registration_one_open" ON "oem_registration_periods"("group_membership_id") WHERE "ends_at" IS NULL;
ALTER TABLE "oem_registration_periods" ADD CONSTRAINT "oem_registration_membership_fk" FOREIGN KEY ("workspace_id","group_id","group_membership_id","user_id") REFERENCES "group_memberships"("workspace_id","group_id","id","user_id") ON DELETE RESTRICT;
ALTER TABLE "oem_registration_periods" ADD CONSTRAINT "oem_registration_period_valid" CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at");
ALTER TABLE "oem_offering_periods" ADD CONSTRAINT "oem_offering_group_fk" FOREIGN KEY ("workspace_id","group_id") REFERENCES "groups"("workspace_id","id") ON DELETE RESTRICT;
ALTER TABLE "oem_offering_periods" ADD CONSTRAINT "oem_offering_valid" CHECK ("classification" IN ('FREE','PAID','PAID_BUNDLE') AND "product_policy" IN ('HASSY','MANABERU_STYLE') AND NOT ("product_policy" = 'MANABERU_STYLE' AND "classification" = 'FREE') AND ("ends_at" IS NULL OR "ends_at" > "starts_at"));
CREATE UNIQUE INDEX "oem_offering_one_open" ON "oem_offering_periods"("workspace_id","group_id") WHERE "ends_at" IS NULL;
ALTER TABLE "oem_contract_periods" ADD CONSTRAINT "oem_contract_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT;
ALTER TABLE "oem_contract_periods" ADD CONSTRAINT "oem_contract_period_valid" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");
ALTER TABLE "oem_billing_policies" ADD CONSTRAINT "oem_policy_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT;
ALTER TABLE "commercial_pricing_audits" ADD CONSTRAINT "pricing_audit_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "commercial_pricing_schedules"("id") ON DELETE RESTRICT;
ALTER TABLE "tenant_monthly_usage" ADD CONSTRAINT "usage_pricing_schedule_fk" FOREIGN KEY ("pricing_schedule_id") REFERENCES "commercial_pricing_schedules"("id") ON DELETE RESTRICT;
ALTER TABLE "tenant_invoices" ADD CONSTRAINT "invoice_pricing_schedule_fk" FOREIGN KEY ("pricing_schedule_id") REFERENCES "commercial_pricing_schedules"("id") ON DELETE RESTRICT;
ALTER TABLE "tenant_monthly_usage" ADD CONSTRAINT "usage_billing_counts" CHECK (("billing_rule_version" IS NULL AND "billable_user_count" IS NULL) OR ("billing_rule_version" IS NOT NULL AND "billable_user_count" >= 0 AND "registered_user_count" >= 0 AND "free_active_user_count" >= 0 AND "overlap_user_count" >= 0 AND "overlap_user_count" <= LEAST("registered_user_count","free_active_user_count") AND "billable_user_count" = "registered_user_count" + "free_active_user_count" - "overlap_user_count"));

CREATE FUNCTION "protect_commercial_pricing"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."status" = 'PUBLISHED' THEN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'published pricing is immutable'; END IF;
  IF NEW."tiers" IS DISTINCT FROM OLD."tiers" OR NEW."version" <> OLD."version" OR NEW."name" <> OLD."name" OR NEW."change_reason" <> OLD."change_reason" OR NEW."effective_from" <> OLD."effective_from" OR NEW."status" <> 'CANCELLED' OR OLD."effective_from" <= date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date OR EXISTS (SELECT 1 FROM "tenant_monthly_usage" WHERE "pricing_schedule_id" = OLD."id" AND "status" = 'FINALIZED') THEN RAISE EXCEPTION 'published pricing is immutable'; END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "commercial_pricing_immutable" BEFORE UPDATE OR DELETE ON "commercial_pricing_schedules" FOR EACH ROW EXECUTE FUNCTION "protect_commercial_pricing"();
CREATE FUNCTION "protect_pricing_audit"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'pricing audit is append-only'; END; $$;
CREATE TRIGGER "pricing_audit_append_only" BEFORE UPDATE OR DELETE ON "commercial_pricing_audits" FOR EACH ROW EXECUTE FUNCTION "protect_pricing_audit"();
ALTER TABLE "commercial_pricing_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oem_billing_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oem_registration_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oem_offering_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oem_contract_periods" ENABLE ROW LEVEL SECURITY;
