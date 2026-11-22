-- CreateEnum
CREATE TYPE "FortuneHypothesisKind" AS ENUM ('SELF_UNDERSTANDING', 'ACCESSORIES', 'EXPERT_CONSULTATION');

-- CreateEnum
CREATE TYPE "FortuneInterestStatus" AS ENUM ('INTERESTED', 'CONTACTED', 'REFERRED', 'CLOSED');

-- CreateTable
CREATE TABLE "fortune_product_hypotheses" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "service_setting_id" UUID NOT NULL,
    "kind" "FortuneHypothesisKind" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "proposed_price_yen" INTEGER NOT NULL,
    "external_url" VARCHAR(500),
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fortune_product_hypotheses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fortune_product_interests" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "member_user_id" UUID NOT NULL,
    "hypothesis_id" UUID NOT NULL,
    "status" "FortuneInterestStatus" NOT NULL DEFAULT 'INTERESTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fortune_product_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fortune_sales_experiments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "service_setting_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "product_label" VARCHAR(120) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "channel" VARCHAR(64) NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fortune_sales_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fortune_product_hypotheses_workspace_id_group_id_kind_key" ON "fortune_product_hypotheses"("workspace_id", "group_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "fortune_product_hypotheses_workspace_id_group_id_id_key" ON "fortune_product_hypotheses"("workspace_id", "group_id", "id");

-- CreateIndex
CREATE INDEX "fortune_product_interests_workspace_id_group_id_created_at_idx" ON "fortune_product_interests"("workspace_id", "group_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "fortune_product_interests_hypothesis_id_group_membership_id_key" ON "fortune_product_interests"("hypothesis_id", "group_membership_id");

-- CreateIndex
CREATE INDEX "fortune_sales_experiments_workspace_id_group_id_starts_on_idx" ON "fortune_sales_experiments"("workspace_id", "group_id", "starts_on");

-- AddForeignKey
ALTER TABLE "fortune_product_hypotheses" ADD CONSTRAINT "fortune_product_hypotheses_workspace_id_group_id_service_s_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_setting_id") REFERENCES "fortune_service_settings"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fortune_product_interests" ADD CONSTRAINT "fortune_product_interests_workspace_id_group_id_hypothesis_fkey" FOREIGN KEY ("workspace_id", "group_id", "hypothesis_id") REFERENCES "fortune_product_hypotheses"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fortune_product_interests" ADD CONSTRAINT "fortune_product_interests_workspace_id_group_id_group_memb_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "member_user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fortune_sales_experiments" ADD CONSTRAINT "fortune_sales_experiments_workspace_id_group_id_service_se_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_setting_id") REFERENCES "fortune_service_settings"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fortune_product_hypotheses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fortune_product_interests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fortune_sales_experiments" ENABLE ROW LEVEL SECURITY;
