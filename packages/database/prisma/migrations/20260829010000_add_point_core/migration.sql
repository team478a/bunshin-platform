CREATE TYPE "PointRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'SUSPENDED');
CREATE TYPE "PointTransactionType" AS ENUM ('GRANT', 'CONSUME', 'REVERSAL', 'REFUND', 'EXPIRE', 'RECOVERY');
CREATE TYPE "PointProcessingStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "point_accounts" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "available_points" INTEGER NOT NULL DEFAULT 0,
  "recovery_due" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "point_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_accounts_nonnegative_check" CHECK ("available_points" >= 0 AND "recovery_due" >= 0)
);

CREATE TABLE "point_rule_versions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID,
  "group_id" UUID,
  "campaign_id" UUID,
  "rule_key" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "PointRuleStatus" NOT NULL DEFAULT 'DRAFT',
  "grant_amount" INTEGER NOT NULL,
  "daily_limit" INTEGER,
  "weekly_limit" INTEGER,
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_rule_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_rule_versions_values_check" CHECK ("version" > 0 AND "grant_amount" > 0 AND ("daily_limit" IS NULL OR "daily_limit" > 0) AND ("weekly_limit" IS NULL OR "weekly_limit" > 0) AND ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"))
);

CREATE TABLE "point_rule_budgets" (
  "id" UUID NOT NULL,
  "rule_version_id" UUID NOT NULL,
  "maximum_points" INTEGER NOT NULL,
  "granted_points" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "point_rule_budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_rule_budgets_values_check" CHECK ("maximum_points" > 0 AND "granted_points" >= 0 AND "granted_points" <= "maximum_points")
);

CREATE TABLE "point_transactions" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "group_id" UUID,
  "campaign_id" UUID,
  "rule_version_id" UUID,
  "type" "PointTransactionType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "source_type" VARCHAR(100) NOT NULL,
  "source_id" VARCHAR(200),
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_transactions_amount_check" CHECK (("type" IN ('GRANT', 'REFUND') AND "amount" > 0) OR ("type" IN ('CONSUME', 'REVERSAL', 'EXPIRE', 'RECOVERY') AND "amount" < 0))
);

CREATE TABLE "point_consumption_links" (
  "id" UUID NOT NULL,
  "consumption_transaction_id" UUID NOT NULL,
  "grant_transaction_id" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_consumption_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_consumption_links_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "point_consumption_links_distinct_check" CHECK ("consumption_transaction_id" <> "grant_transaction_id")
);

CREATE TABLE "point_processing_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "source_event_id" VARCHAR(200) NOT NULL,
  "status" "PointProcessingStatus" NOT NULL DEFAULT 'PROCESSING',
  "failure_code" VARCHAR(100),
  "processed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "point_processing_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "point_accounts_workspace_id_user_id_key" ON "point_accounts"("workspace_id", "user_id");
CREATE UNIQUE INDEX "point_accounts_workspace_id_id_user_id_key" ON "point_accounts"("workspace_id", "id", "user_id");
CREATE INDEX "point_accounts_user_id_idx" ON "point_accounts"("user_id");
CREATE UNIQUE INDEX "point_rule_versions_scope_key" ON "point_rule_versions"("rule_key", "version", COALESCE("workspace_id", '00000000-0000-0000-0000-000000000000'::uuid), COALESCE("group_id", '00000000-0000-0000-0000-000000000000'::uuid), COALESCE("campaign_id", '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX "point_rule_versions_rule_key_status_starts_at_ends_at_idx" ON "point_rule_versions"("rule_key", "status", "starts_at", "ends_at");
CREATE INDEX "point_rule_versions_workspace_id_group_id_campaign_id_status_idx" ON "point_rule_versions"("workspace_id", "group_id", "campaign_id", "status");
CREATE UNIQUE INDEX "point_rule_budgets_rule_version_id_key" ON "point_rule_budgets"("rule_version_id");
CREATE UNIQUE INDEX "point_transactions_account_id_idempotency_key_key" ON "point_transactions"("account_id", "idempotency_key");
CREATE INDEX "point_transactions_workspace_id_user_id_created_at_idx" ON "point_transactions"("workspace_id", "user_id", "created_at");
CREATE INDEX "point_transactions_group_id_campaign_id_created_at_idx" ON "point_transactions"("group_id", "campaign_id", "created_at");
CREATE INDEX "point_transactions_expires_at_idx" ON "point_transactions"("expires_at");
CREATE UNIQUE INDEX "point_consumption_links_consumption_transaction_id_grant_transaction_id_key" ON "point_consumption_links"("consumption_transaction_id", "grant_transaction_id");
CREATE INDEX "point_consumption_links_grant_transaction_id_idx" ON "point_consumption_links"("grant_transaction_id");
CREATE UNIQUE INDEX "point_processing_events_workspace_id_event_type_source_event_id_key" ON "point_processing_events"("workspace_id", "event_type", "source_event_id");
CREATE INDEX "point_processing_events_workspace_id_user_id_status_created_at_idx" ON "point_processing_events"("workspace_id", "user_id", "status", "created_at");

ALTER TABLE "point_accounts" ADD CONSTRAINT "point_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_accounts" ADD CONSTRAINT "point_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_rule_versions" ADD CONSTRAINT "point_rule_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_rule_versions" ADD CONSTRAINT "point_rule_versions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_rule_versions" ADD CONSTRAINT "point_rule_versions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_rule_budgets" ADD CONSTRAINT "point_rule_budgets_rule_version_id_fkey" FOREIGN KEY ("rule_version_id") REFERENCES "point_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_account_scope_fkey" FOREIGN KEY ("workspace_id", "account_id", "user_id") REFERENCES "point_accounts"("workspace_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_rule_version_id_fkey" FOREIGN KEY ("rule_version_id") REFERENCES "point_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_consumption_links" ADD CONSTRAINT "point_consumption_links_consumption_transaction_id_fkey" FOREIGN KEY ("consumption_transaction_id") REFERENCES "point_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_consumption_links" ADD CONSTRAINT "point_consumption_links_grant_transaction_id_fkey" FOREIGN KEY ("grant_transaction_id") REFERENCES "point_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_processing_events" ADD CONSTRAINT "point_processing_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_processing_events" ADD CONSTRAINT "point_processing_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
