CREATE TYPE "UserRegistrationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SUSPENDED');
CREATE TYPE "IndustryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "industries" (
  "id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "status" "IndustryStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_registration_profiles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "UserRegistrationStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "current_step" INTEGER NOT NULL DEFAULT 1,
  "primary_industry_id" UUID,
  "other_industry_text" VARCHAR(160),
  "primary_purpose" VARCHAR(80),
  "secondary_purposes" JSONB NOT NULL DEFAULT '[]',
  "activity_name" VARCHAR(120),
  "business_name" VARCHAR(200),
  "region" VARCHAR(160),
  "product_service" VARCHAR(1000),
  "social_profiles" JSONB NOT NULL DEFAULT '[]',
  "source_context" JSONB NOT NULL DEFAULT '{}',
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "suspended_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "user_registration_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "industries_key_key" ON "industries"("key");
CREATE INDEX "industries_status_display_order_idx" ON "industries"("status", "display_order");
CREATE UNIQUE INDEX "user_registration_profiles_user_id_key" ON "user_registration_profiles"("user_id");
CREATE INDEX "user_registration_profiles_status_updated_at_idx" ON "user_registration_profiles"("status", "updated_at");
CREATE INDEX "user_registration_profiles_primary_industry_id_status_idx" ON "user_registration_profiles"("primary_industry_id", "status");
ALTER TABLE "user_registration_profiles" ADD CONSTRAINT "user_registration_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_registration_profiles" ADD CONSTRAINT "user_registration_profiles_primary_industry_id_fkey" FOREIGN KEY ("primary_industry_id") REFERENCES "industries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_registration_profiles" ADD CONSTRAINT "user_registration_profiles_current_step_check" CHECK ("current_step" BETWEEN 1 AND 4);

INSERT INTO "industries" ("id", "key", "name", "display_order", "updated_at") VALUES
  (gen_random_uuid(), 'FOOD', '飲食', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BEAUTY', '美容', 20, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CONSTRUCTION', '建築・建設', 30, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'RETAIL_EC', '小売・EC', 40, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PROFESSIONAL', '士業・専門サービス', 50, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HEALTHCARE', '医療・福祉', 60, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'EDUCATION', '教育・スクール', 70, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OTHER', 'その他', 999, CURRENT_TIMESTAMP);
