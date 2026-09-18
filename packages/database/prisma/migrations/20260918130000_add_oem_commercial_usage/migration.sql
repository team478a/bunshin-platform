CREATE TYPE "TenantMonthlyUsageStatus" AS ENUM ('OPEN', 'FINALIZED');

CREATE TABLE "service_usage_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "source" VARCHAR(80) NOT NULL,
    "idempotency_key" VARCHAR(240) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_monthly_usage" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "time_zone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Tokyo',
    "mau" INTEGER NOT NULL,
    "pricing_tier_key" VARCHAR(40) NOT NULL,
    "calculated_price_yen" INTEGER,
    "pricing_version" VARCHAR(80) NOT NULL,
    "status" "TenantMonthlyUsageStatus" NOT NULL DEFAULT 'OPEN',
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_monthly_usage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_monthly_usage_non_negative_mau" CHECK ("mau" >= 0),
    CONSTRAINT "tenant_monthly_usage_valid_period" CHECK ("period_start" < "period_end"),
    CONSTRAINT "tenant_monthly_usage_finalized_at" CHECK (("status" = 'OPEN' AND "finalized_at" IS NULL) OR ("status" = 'FINALIZED' AND "finalized_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "service_usage_events_workspace_id_idempotency_key_key" ON "service_usage_events"("workspace_id", "idempotency_key");
CREATE INDEX "service_usage_events_workspace_id_occurred_at_user_id_idx" ON "service_usage_events"("workspace_id", "occurred_at", "user_id");
CREATE INDEX "service_usage_events_workspace_id_group_id_occurred_at_idx" ON "service_usage_events"("workspace_id", "group_id", "occurred_at");
CREATE INDEX "service_usage_events_group_membership_id_occurred_at_idx" ON "service_usage_events"("group_membership_id", "occurred_at");
CREATE UNIQUE INDEX "tenant_monthly_usage_workspace_id_period_start_key" ON "tenant_monthly_usage"("workspace_id", "period_start");
CREATE INDEX "tenant_monthly_usage_period_start_status_idx" ON "tenant_monthly_usage"("period_start", "status");
CREATE INDEX "tenant_monthly_usage_workspace_id_status_period_start_idx" ON "tenant_monthly_usage"("workspace_id", "status", "period_start");

ALTER TABLE "service_usage_events" ADD CONSTRAINT "service_usage_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_usage_events" ADD CONSTRAINT "service_usage_events_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_usage_events" ADD CONSTRAINT "service_usage_events_workspace_id_group_id_group_membership_id_user_id_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_usage_events" ADD CONSTRAINT "service_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_monthly_usage" ADD CONSTRAINT "tenant_monthly_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_usage_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_monthly_usage" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION "protect_finalized_tenant_monthly_usage"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'FINALIZED' THEN
    RAISE EXCEPTION 'finalized tenant monthly usage is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "tenant_monthly_usage_immutable"
BEFORE UPDATE OR DELETE ON "tenant_monthly_usage"
FOR EACH ROW EXECUTE FUNCTION "protect_finalized_tenant_monthly_usage"();
