CREATE TABLE "point_balance_repair_audits" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "previous_balance" INTEGER NOT NULL,
  "repaired_balance" INTEGER NOT NULL,
  "ledger_balance" INTEGER NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "performed_by_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_balance_repair_audits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "point_balance_repair_audits" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "point_balance_repair_audits_workspace_id_occurred_at_idx"
  ON "point_balance_repair_audits"("workspace_id", "occurred_at");
CREATE INDEX "point_balance_repair_audits_account_id_occurred_at_idx"
  ON "point_balance_repair_audits"("account_id", "occurred_at");
CREATE INDEX "point_balance_repair_audits_performed_by_user_id_occurred_at_idx"
  ON "point_balance_repair_audits"("performed_by_user_id", "occurred_at");

ALTER TABLE "point_balance_repair_audits"
  ADD CONSTRAINT "point_balance_repair_audits_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_balance_repair_audits"
  ADD CONSTRAINT "point_balance_repair_audits_workspace_id_account_id_user_id_fkey"
  FOREIGN KEY ("workspace_id", "account_id", "user_id")
  REFERENCES "point_accounts"("workspace_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_balance_repair_audits"
  ADD CONSTRAINT "point_balance_repair_audits_performed_by_user_id_fkey"
  FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
