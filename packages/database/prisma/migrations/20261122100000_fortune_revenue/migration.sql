-- AlterEnum
ALTER TYPE "ServiceMembershipEventType" ADD VALUE 'FORTUNE_FUNNEL';

-- AlterTable
ALTER TABLE "fortune_commerce_purchases" ADD COLUMN     "acquisition_campaign" VARCHAR(64),
ADD COLUMN     "acquisition_channel" VARCHAR(64),
ADD COLUMN     "acquisition_medium" VARCHAR(64),
ADD COLUMN     "stripe_fee_yen" INTEGER;

-- CreateTable
CREATE TABLE "fortune_acquisition_visits" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "service_setting_id" UUID NOT NULL,
    "channel" VARCHAR(64) NOT NULL,
    "medium" VARCHAR(64),
    "campaign" VARCHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fortune_acquisition_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fortune_advertising_spend" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "service_setting_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "channel" VARCHAR(64) NOT NULL,
    "amount_yen" INTEGER NOT NULL,

    CONSTRAINT "fortune_advertising_spend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fortune_commerce_refunds" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "observed_amount_yen" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fortune_commerce_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fortune_acquisition_visits_workspace_id_group_id_occurred_a_idx" ON "fortune_acquisition_visits"("workspace_id", "group_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "fortune_advertising_spend_workspace_id_group_id_month_chann_key" ON "fortune_advertising_spend"("workspace_id", "group_id", "month", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "fortune_commerce_refunds_purchase_id_observed_amount_yen_key" ON "fortune_commerce_refunds"("purchase_id", "observed_amount_yen");

-- AddForeignKey
ALTER TABLE "fortune_acquisition_visits" ADD CONSTRAINT "fortune_acquisition_visits_workspace_id_group_id_service_s_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_setting_id") REFERENCES "fortune_service_settings"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fortune_advertising_spend" ADD CONSTRAINT "fortune_advertising_spend_workspace_id_group_id_service_se_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_setting_id") REFERENCES "fortune_service_settings"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fortune_commerce_refunds" ADD CONSTRAINT "fortune_commerce_refunds_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "fortune_commerce_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fortune_acquisition_visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fortune_advertising_spend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fortune_commerce_refunds" ENABLE ROW LEVEL SECURITY;
