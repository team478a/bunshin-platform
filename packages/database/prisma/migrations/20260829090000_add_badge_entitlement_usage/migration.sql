CREATE TYPE "BadgeRewardEntitlementUsageStatus" AS ENUM ('CONSUMED', 'REFUNDED');

CREATE UNIQUE INDEX "badge_reward_entitlements_workspace_id_user_id_id_key"
  ON "badge_reward_entitlements"("workspace_id", "user_id", "id");

CREATE TABLE "badge_reward_entitlement_usages" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "entitlement_id" UUID NOT NULL,
  "feature_key" VARCHAR(120) NOT NULL,
  "resource_type" VARCHAR(100) NOT NULL,
  "resource_id" VARCHAR(200) NOT NULL,
  "operation_key" VARCHAR(200) NOT NULL,
  "estimated_cost_usd_micros" INTEGER NOT NULL,
  "status" "BadgeRewardEntitlementUsageStatus" NOT NULL DEFAULT 'CONSUMED',
  "consumed_at" TIMESTAMPTZ(6) NOT NULL,
  "refunded_at" TIMESTAMPTZ(6),
  "refund_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "badge_reward_entitlement_usages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_reward_entitlement_usages_entitlement_fkey"
    FOREIGN KEY ("workspace_id", "user_id", "entitlement_id")
    REFERENCES "badge_reward_entitlements"("workspace_id", "user_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "badge_reward_entitlement_usages_cost_check"
    CHECK ("estimated_cost_usd_micros" >= 0)
);

CREATE UNIQUE INDEX "badge_reward_entitlement_usages_operation_key"
  ON "badge_reward_entitlement_usages"("workspace_id", "user_id", "operation_key");
CREATE UNIQUE INDEX "badge_reward_entitlement_usages_resource_key"
  ON "badge_reward_entitlement_usages"("workspace_id", "user_id", "resource_type", "resource_id");
CREATE INDEX "badge_reward_entitlement_usages_entitlement_status_created_idx"
  ON "badge_reward_entitlement_usages"("entitlement_id", "status", "created_at");
