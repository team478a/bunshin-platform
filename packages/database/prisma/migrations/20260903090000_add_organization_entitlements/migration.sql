CREATE TABLE "organization_entitlements" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "max_groups" INTEGER,
    "max_operators" INTEGER,
    "max_members" INTEGER,
    "max_services" INTEGER,
    "monthly_ai_generation_limit" INTEGER,
    "monthly_image_generation_limit" INTEGER,
    "monthly_video_generation_limit" INTEGER,
    "dedicated_line_enabled" BOOLEAN NOT NULL DEFAULT false,
    "oem_enabled" BOOLEAN NOT NULL DEFAULT false,
    "custom_domain_enabled" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "organization_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_entitlement_audits" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_entitlement_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_entitlements_workspace_id_key" ON "organization_entitlements"("workspace_id");
CREATE INDEX "organization_entitlements_suspended_starts_at_ends_at_idx" ON "organization_entitlements"("suspended", "starts_at", "ends_at");
CREATE INDEX "organization_entitlement_audits_workspace_id_occurred_at_idx" ON "organization_entitlement_audits"("workspace_id", "occurred_at");
CREATE INDEX "organization_entitlement_audits_actor_user_id_occurred_at_idx" ON "organization_entitlement_audits"("actor_user_id", "occurred_at");

ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_entitlement_audits" ADD CONSTRAINT "organization_entitlement_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_entitlement_audits" ADD CONSTRAINT "organization_entitlement_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_limits_check" CHECK (
  ("max_groups" IS NULL OR "max_groups" >= 1) AND
  ("max_operators" IS NULL OR "max_operators" >= 1) AND
  ("max_members" IS NULL OR "max_members" >= 1) AND
  ("max_services" IS NULL OR "max_services" >= 1) AND
  ("monthly_ai_generation_limit" IS NULL OR "monthly_ai_generation_limit" >= 1) AND
  ("monthly_image_generation_limit" IS NULL OR "monthly_image_generation_limit" >= 1) AND
  ("monthly_video_generation_limit" IS NULL OR "monthly_video_generation_limit" >= 1) AND
  ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at")
);
