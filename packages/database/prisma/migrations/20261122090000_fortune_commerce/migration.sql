-- CreateEnum
CREATE TYPE "FortuneCommercePurchaseStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'REFUNDED');

-- CreateTable
CREATE TABLE "fortune_commerce_products" (
    "service_setting_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "delivery_terms" VARCHAR(500) NOT NULL,
    "refund_terms" VARCHAR(500) NOT NULL,
    "amount_yen" INTEGER NOT NULL,
    "follow_up_limit" INTEGER NOT NULL DEFAULT 2,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fortune_commerce_products_pkey" PRIMARY KEY ("service_setting_id")
);

-- CreateTable
CREATE TABLE "fortune_commerce_purchases" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "service_setting_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "buyer_user_id" UUID NOT NULL,
    "payment_configuration_id" UUID NOT NULL,
    "product_revision" UUID NOT NULL,
    "product_name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "delivery_terms" VARCHAR(500) NOT NULL,
    "refund_terms" VARCHAR(500) NOT NULL,
    "follow_up_limit" INTEGER NOT NULL,
    "amount_yen" INTEGER NOT NULL,
    "live_mode" BOOLEAN NOT NULL,
    "status" "FortuneCommercePurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "provider_checkout_session_id" VARCHAR(200),
    "provider_payment_intent_id" VARCHAR(200),
    "refunded_amount_yen" INTEGER NOT NULL DEFAULT 0,
    "reading_id" UUID,
    "delivered_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "payment_failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fortune_commerce_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fortune_commerce_products_workspace_id_group_id_service_set_key" ON "fortune_commerce_products"("workspace_id", "group_id", "service_setting_id");

-- CreateIndex
CREATE UNIQUE INDEX "fortune_commerce_purchases_provider_checkout_session_id_key" ON "fortune_commerce_purchases"("provider_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "fortune_commerce_purchases_provider_payment_intent_id_key" ON "fortune_commerce_purchases"("provider_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "fortune_commerce_purchases_reading_id_key" ON "fortune_commerce_purchases"("reading_id");

-- CreateIndex
CREATE INDEX "fortune_commerce_purchases_workspace_id_group_id_buyer_user_idx" ON "fortune_commerce_purchases"("workspace_id", "group_id", "buyer_user_id", "status");

-- CreateIndex
CREATE INDEX "fortune_commerce_purchases_workspace_id_group_id_paid_at_idx" ON "fortune_commerce_purchases"("workspace_id", "group_id", "paid_at");

-- AddForeignKey
ALTER TABLE "fortune_commerce_products" ADD CONSTRAINT "fortune_commerce_products_workspace_id_group_id_service_se_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_setting_id") REFERENCES "fortune_service_settings"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fortune_commerce_purchases" ADD CONSTRAINT "fortune_commerce_purchases_workspace_id_group_id_group_mem_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "buyer_user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fortune_commerce_purchases" ADD CONSTRAINT "fortune_commerce_purchases_workspace_id_group_id_service_s_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_setting_id") REFERENCES "fortune_commerce_products"("workspace_id", "group_id", "service_setting_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fortune_commerce_purchases" ADD CONSTRAINT "fortune_commerce_purchases_workspace_id_payment_configurat_fkey" FOREIGN KEY ("workspace_id", "payment_configuration_id") REFERENCES "organization_payment_configurations"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fortune_commerce_products" ADD CONSTRAINT "fortune_commerce_products_terms_check"
    CHECK ("amount_yen" BETWEEN 50 AND 99999999 AND "follow_up_limit" BETWEEN 0 AND 2);

ALTER TABLE "fortune_commerce_purchases" ADD CONSTRAINT "fortune_commerce_purchases_terms_check"
    CHECK ("amount_yen" BETWEEN 50 AND 99999999 AND "follow_up_limit" BETWEEN 0 AND 2
        AND "refunded_amount_yen" BETWEEN 0 AND "amount_yen"
        AND ("status" <> 'PAID' OR "paid_at" IS NOT NULL)
        AND ("delivered_at" IS NULL OR "reading_id" IS NOT NULL));

ALTER TABLE "fortune_commerce_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fortune_commerce_purchases" ENABLE ROW LEVEL SECURITY;
