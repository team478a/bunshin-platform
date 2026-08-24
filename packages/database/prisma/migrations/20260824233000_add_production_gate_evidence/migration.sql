CREATE TYPE "ProductionGateCheckKey" AS ENUM (
  'BACKUP_RESTORE',
  'MIGRATION_HEALTH',
  'AUTH_SMOKE',
  'FREE_MVP_SMOKE',
  'ACCOUNT_DELETION_DRY_RUN',
  'LINE_GO_NO_GO',
  'FINAL_APPROVAL'
);

CREATE TYPE "ProductionGateEvidenceAction" AS ENUM ('RECORDED', 'REVOKED');

CREATE TABLE "production_gate_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "check_key" "ProductionGateCheckKey" NOT NULL,
  "commit_sha" VARCHAR(40) NOT NULL,
  "action" "ProductionGateEvidenceAction" NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "evidence_url" VARCHAR(2048),
  "actor_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_gate_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_gate_evidence_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "production_gate_evidence_environment_commit_sha_check_key_occurred_at_idx"
  ON "production_gate_evidence"("environment", "commit_sha", "check_key", "occurred_at");
CREATE INDEX "production_gate_evidence_actor_user_id_occurred_at_idx"
  ON "production_gate_evidence"("actor_user_id", "occurred_at");
