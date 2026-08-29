CREATE TYPE "BadgeRewardType" AS ENUM ('ENTITLEMENT');
CREATE TYPE "BadgeRewardLinkStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "BadgeRewardOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'RETRY', 'DEAD', 'CANCELLED');
CREATE TYPE "BadgeRewardEntitlementStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REVOKED', 'EXPIRED');

CREATE TABLE "badge_reward_links" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "badge_award_id" UUID NOT NULL,
  "badge_version_id" UUID NOT NULL,
  "reward_type" "BadgeRewardType" NOT NULL,
  "reward_config_snapshot" JSONB NOT NULL,
  "status" "BadgeRewardLinkStatus" NOT NULL DEFAULT 'PENDING',
  "failure_code" VARCHAR(100),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "badge_reward_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_reward_links_status_check" CHECK (
    ("status" = 'FAILED' AND "failure_code" IS NOT NULL) OR
    ("status" <> 'FAILED' AND "failure_code" IS NULL)
  )
);

CREATE TABLE "badge_reward_outbox" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "reward_link_id" UUID NOT NULL,
  "event_type" VARCHAR(80) NOT NULL DEFAULT 'BADGE_REWARD_REQUESTED',
  "status" "BadgeRewardOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_owner" VARCHAR(120),
  "lease_expires_at" TIMESTAMPTZ(6),
  "last_failure_code" VARCHAR(100),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "badge_reward_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_reward_outbox_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" BETWEEN 1 AND 20)
);

CREATE TABLE "badge_reward_entitlements" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "badge_award_id" UUID NOT NULL,
  "reward_link_id" UUID NOT NULL,
  "feature_key" VARCHAR(120) NOT NULL,
  "quantity_granted" INTEGER NOT NULL,
  "quantity_remaining" INTEGER NOT NULL,
  "max_unit_cost_usd_micros" INTEGER NOT NULL,
  "revocation_policy" VARCHAR(40) NOT NULL DEFAULT 'REVOKE_UNUSED',
  "status" "BadgeRewardEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(6),
  "consumed_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "badge_reward_entitlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_reward_entitlements_quantity_check" CHECK (
    "quantity_granted" BETWEEN 1 AND 100 AND
    "quantity_remaining" BETWEEN 0 AND "quantity_granted"
  ),
  CONSTRAINT "badge_reward_entitlements_cost_cap_check" CHECK ("max_unit_cost_usd_micros" BETWEEN 0 AND 100000000),
  CONSTRAINT "badge_reward_entitlements_revocation_policy_check" CHECK ("revocation_policy" = 'REVOKE_UNUSED')
);

CREATE UNIQUE INDEX "badge_reward_links_badge_award_id_key" ON "badge_reward_links"("badge_award_id");
CREATE UNIQUE INDEX "badge_reward_links_workspace_id_user_id_badge_award_id_key" ON "badge_reward_links"("workspace_id", "user_id", "badge_award_id");
CREATE UNIQUE INDEX "badge_reward_links_workspace_id_user_id_id_key" ON "badge_reward_links"("workspace_id", "user_id", "id");
CREATE INDEX "badge_reward_links_workspace_id_user_id_status_created_at_idx" ON "badge_reward_links"("workspace_id", "user_id", "status", "created_at");
CREATE UNIQUE INDEX "badge_reward_outbox_reward_link_id_key" ON "badge_reward_outbox"("reward_link_id");
CREATE INDEX "badge_reward_outbox_status_available_at_created_at_idx" ON "badge_reward_outbox"("status", "available_at", "created_at");
CREATE INDEX "badge_reward_outbox_workspace_id_user_id_status_idx" ON "badge_reward_outbox"("workspace_id", "user_id", "status");
CREATE UNIQUE INDEX "badge_reward_entitlements_reward_link_id_key" ON "badge_reward_entitlements"("reward_link_id");
CREATE INDEX "badge_reward_entitlements_workspace_id_user_id_feature_key_status_expires_at_idx" ON "badge_reward_entitlements"("workspace_id", "user_id", "feature_key", "status", "expires_at");
CREATE INDEX "badge_reward_entitlements_badge_award_id_idx" ON "badge_reward_entitlements"("badge_award_id");

ALTER TABLE "badge_reward_links" ADD CONSTRAINT "badge_reward_links_award_scope_fkey"
  FOREIGN KEY ("workspace_id", "user_id", "badge_award_id") REFERENCES "badge_awards"("workspace_id", "user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_reward_links" ADD CONSTRAINT "badge_reward_links_badge_version_id_fkey"
  FOREIGN KEY ("badge_version_id") REFERENCES "badge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_reward_outbox" ADD CONSTRAINT "badge_reward_outbox_link_scope_fkey"
  FOREIGN KEY ("workspace_id", "user_id", "reward_link_id") REFERENCES "badge_reward_links"("workspace_id", "user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_reward_entitlements" ADD CONSTRAINT "badge_reward_entitlements_link_scope_fkey"
  FOREIGN KEY ("workspace_id", "user_id", "reward_link_id") REFERENCES "badge_reward_links"("workspace_id", "user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
