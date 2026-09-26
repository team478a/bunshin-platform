CREATE TYPE "SocialActivityBarrierConfirmationResponse" AS ENUM ('CONFIRMED', 'NONE_OF_THESE');
CREATE TYPE "SocialActivitySupportStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'COMPLETED', 'SKIPPED');

CREATE TABLE "social_activity_barrier_confirmations" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "response" "SocialActivityBarrierConfirmationResponse" NOT NULL,
  "selected_category" "SocialActivityBarrierCategory",
  "actor_user_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_activity_barrier_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "social_activity_support_interventions" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "support_key" VARCHAR(80) NOT NULL,
  "status" "SocialActivitySupportStatus" NOT NULL DEFAULT 'OFFERED',
  "definition_snapshot" JSONB NOT NULL,
  "rule_version" VARCHAR(80) NOT NULL,
  "idempotency_key" VARCHAR(220) NOT NULL,
  "offered_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "skipped_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_activity_support_interventions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_activity_barrier_confirmations_idempotency_key"
  ON "social_activity_barrier_confirmations"("idempotency_key");
CREATE INDEX "social_activity_barrier_confirmations_case_idx"
  ON "social_activity_barrier_confirmations"("case_id", "occurred_at");
CREATE INDEX "social_activity_barrier_confirmations_actor_idx"
  ON "social_activity_barrier_confirmations"("actor_user_id", "occurred_at");
CREATE UNIQUE INDEX "social_activity_support_interventions_idempotency_key"
  ON "social_activity_support_interventions"("idempotency_key");
CREATE INDEX "social_activity_support_case_status_idx"
  ON "social_activity_support_interventions"("case_id", "status", "offered_at");

ALTER TABLE "social_activity_barrier_confirmations"
  ADD CONSTRAINT "social_activity_barrier_confirmations_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "social_activity_barrier_cases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_activity_support_interventions"
  ADD CONSTRAINT "social_activity_support_interventions_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "social_activity_barrier_cases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_activity_barrier_confirmations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_activity_support_interventions" ENABLE ROW LEVEL SECURITY;
