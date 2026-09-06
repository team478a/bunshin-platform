CREATE TABLE "service_member_business_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "primary_industry_id" UUID,
  "other_industry_text" VARCHAR(160),
  "business_name" VARCHAR(200) NOT NULL,
  "region" VARCHAR(160),
  "product_service" VARCHAR(1000) NOT NULL,
  "primary_purpose" VARCHAR(80) NOT NULL,
  "target_audience" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_member_business_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_member_business_profiles_group_membership_id_key"
  ON "service_member_business_profiles"("group_membership_id");
CREATE UNIQUE INDEX "service_member_business_profiles_scope_key"
  ON "service_member_business_profiles"("workspace_id", "group_id", "group_membership_id", "user_id");
CREATE INDEX "service_member_business_profiles_industry_idx"
  ON "service_member_business_profiles"("workspace_id", "group_id", "primary_industry_id");
CREATE INDEX "service_member_business_profiles_user_idx"
  ON "service_member_business_profiles"("workspace_id", "group_id", "user_id");

ALTER TABLE "service_member_business_profiles"
  ADD CONSTRAINT "service_member_business_profiles_workspace_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_member_business_profiles"
  ADD CONSTRAINT "service_member_business_profiles_group_fkey"
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_member_business_profiles"
  ADD CONSTRAINT "service_member_business_profiles_membership_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
  REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_member_business_profiles"
  ADD CONSTRAINT "service_member_business_profiles_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_member_business_profiles"
  ADD CONSTRAINT "service_member_business_profiles_industry_fkey"
  FOREIGN KEY ("primary_industry_id") REFERENCES "industries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "service_ai_generation_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "month_key" CHAR(7) NOT NULL,
  "operation_key" VARCHAR(200) NOT NULL,
  "status" "OrganizationAiReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "released_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_ai_generation_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_ai_generation_reservations_operation_key"
  ON "service_ai_generation_reservations"("workspace_id", "group_id", "operation_key");
CREATE INDEX "service_ai_generation_reservations_month_status_idx"
  ON "service_ai_generation_reservations"("workspace_id", "group_id", "month_key", "status", "expires_at");

ALTER TABLE "service_ai_generation_reservations"
  ADD CONSTRAINT "service_ai_generation_reservations_workspace_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_ai_generation_reservations"
  ADD CONSTRAINT "service_ai_generation_reservations_group_fkey"
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "industries" ("id", "key", "name", "display_order", "updated_at") VALUES
  (gen_random_uuid(), 'REAL_ESTATE', '不動産', 80, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HOSPITALITY', '宿泊・観光', 90, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MANUFACTURING', '製造', 100, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IT_SAAS', 'IT・SaaS', 110, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CONSULTING', 'コンサルティング', 120, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FITNESS', 'フィットネス', 130, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'AUTOMOTIVE', '自動車', 140, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'AGRICULTURE', '農林水産', 150, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
