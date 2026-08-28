CREATE TYPE "PointCatalogStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'RETIRED');
CREATE TYPE "PointRewardType" AS ENUM ('SOCIAL_IMAGE_GENERATION', 'ALTERNATIVE_PLAN_GENERATION');
CREATE TYPE "PointRedemptionStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED', 'REFUNDED');

CREATE TABLE "point_reward_catalog_items" (
  "id" UUID NOT NULL,
  "reward_key" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL,
  "reward_type" "PointRewardType" NOT NULL,
  "title" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "point_cost" INTEGER NOT NULL,
  "status" "PointCatalogStatus" NOT NULL DEFAULT 'DRAFT',
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_reward_catalog_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_reward_catalog_values_check" CHECK ("version" > 0 AND "point_cost" > 0 AND ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"))
);

CREATE TABLE "point_redemptions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "catalog_item_id" UUID NOT NULL,
  "consumption_transaction_id" UUID NOT NULL,
  "status" "PointRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
  "point_cost" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "resource_type" VARCHAR(100),
  "resource_id" VARCHAR(200),
  "reserved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reservation_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6),
  "released_at" TIMESTAMPTZ(6),
  "refunded_at" TIMESTAMPTZ(6),
  "failure_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "point_redemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_redemptions_values_check" CHECK ("point_cost" > 0 AND "reservation_expires_at" > "reserved_at")
);

CREATE UNIQUE INDEX "point_reward_catalog_items_reward_key_version_key" ON "point_reward_catalog_items"("reward_key", "version");
CREATE INDEX "point_reward_catalog_items_status_starts_at_ends_at_idx" ON "point_reward_catalog_items"("status", "starts_at", "ends_at");
CREATE UNIQUE INDEX "point_redemptions_consumption_transaction_id_key" ON "point_redemptions"("consumption_transaction_id");
CREATE UNIQUE INDEX "point_redemptions_account_id_idempotency_key_key" ON "point_redemptions"("account_id", "idempotency_key");
CREATE INDEX "point_redemptions_workspace_id_user_id_status_created_at_idx" ON "point_redemptions"("workspace_id", "user_id", "status", "created_at");
CREATE INDEX "point_redemptions_status_reservation_expires_at_idx" ON "point_redemptions"("status", "reservation_expires_at");

ALTER TABLE "point_redemptions" ADD CONSTRAINT "point_redemptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_redemptions" ADD CONSTRAINT "point_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_redemptions" ADD CONSTRAINT "point_redemptions_account_scope_fkey" FOREIGN KEY ("workspace_id", "account_id", "user_id") REFERENCES "point_accounts"("workspace_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_redemptions" ADD CONSTRAINT "point_redemptions_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "point_reward_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_redemptions" ADD CONSTRAINT "point_redemptions_consumption_transaction_id_fkey" FOREIGN KEY ("consumption_transaction_id") REFERENCES "point_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "point_reward_catalog_items" (
  "id", "reward_key", "version", "reward_type", "title", "description", "point_cost", "status"
) VALUES
  ('00000000-0000-4000-8000-000000000501', 'SOCIAL_IMAGE_GENERATION', 1, 'SOCIAL_IMAGE_GENERATION', '投稿用の画像を1回作る', '投稿内容に合う画像を1回作れます。', 50, 'ACTIVE'),
  ('00000000-0000-4000-8000-000000000502', 'ALTERNATIVE_PLAN_GENERATION', 1, 'ALTERNATIVE_PLAN_GENERATION', '別の企画を1回作る', '今日の企画とは違う案を1回作れます。', 30, 'ACTIVE');
