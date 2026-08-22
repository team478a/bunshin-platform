CREATE TABLE "account_deletion_operation_audits" (
  "id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "previous_status" "AccountDeletionRequestStatus" NOT NULL,
  "next_status" "AccountDeletionRequestStatus" NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_deletion_operation_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_deletion_operation_audits_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "account_deletion_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "account_deletion_operation_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "account_deletion_operation_audits_request_id_occurred_at_idx"
  ON "account_deletion_operation_audits"("request_id", "occurred_at");

CREATE INDEX "account_deletion_operation_audits_actor_user_id_occurred_at_idx"
  ON "account_deletion_operation_audits"("actor_user_id", "occurred_at");
