CREATE TYPE "ServiceVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "ServiceRegistrationMode" AS ENUM ('PUBLIC', 'INVITATION_ONLY', 'APPROVAL_REQUIRED', 'CLOSED');

CREATE TABLE "service_configurations" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "display_name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "operator_name" VARCHAR(160) NOT NULL,
  "contact_email" VARCHAR(320),
  "visibility" "ServiceVisibility" NOT NULL DEFAULT 'PRIVATE',
  "powered_by_enabled" BOOLEAN NOT NULL DEFAULT true,
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "terms_url" VARCHAR(2048),
  "privacy_url" VARCHAR(2048),
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_configurations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_configurations_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT "service_configurations_period_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at"),
  CONSTRAINT "service_configurations_terms_url_check" CHECK ("terms_url" IS NULL OR "terms_url" ~ '^https://'),
  CONSTRAINT "service_configurations_privacy_url_check" CHECK ("privacy_url" IS NULL OR "privacy_url" ~ '^https://')
);

CREATE TABLE "service_brands" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "logo_url" VARCHAR(2048),
  "icon_url" VARCHAR(2048),
  "favicon_url" VARCHAR(2048),
  "primary_color" CHAR(7) NOT NULL DEFAULT '#0B356A',
  "secondary_color" CHAR(7) NOT NULL DEFAULT '#FF3B30',
  "font_family" VARCHAR(120) NOT NULL DEFAULT 'system-ui',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_brands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_brands_primary_color_check" CHECK ("primary_color" ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT "service_brands_secondary_color_check" CHECK ("secondary_color" ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT "service_brands_logo_url_check" CHECK ("logo_url" IS NULL OR "logo_url" ~ '^https://'),
  CONSTRAINT "service_brands_icon_url_check" CHECK ("icon_url" IS NULL OR "icon_url" ~ '^https://'),
  CONSTRAINT "service_brands_favicon_url_check" CHECK ("favicon_url" IS NULL OR "favicon_url" ~ '^https://')
);

CREATE TABLE "service_registration_policies" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "mode" "ServiceRegistrationMode" NOT NULL DEFAULT 'INVITATION_ONLY',
  "email_enabled" BOOLEAN NOT NULL DEFAULT true,
  "line_enabled" BOOLEAN NOT NULL DEFAULT false,
  "invite_code_enabled" BOOLEAN NOT NULL DEFAULT false,
  "referral_enabled" BOOLEAN NOT NULL DEFAULT false,
  "onboarding_config" JSONB NOT NULL DEFAULT '{}',
  "survey_config" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_registration_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_configuration_audits" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "performed_by_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_configuration_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_configurations_group_id_key" ON "service_configurations"("group_id");
CREATE UNIQUE INDEX "service_configurations_slug_key" ON "service_configurations"("slug");
CREATE UNIQUE INDEX "service_configurations_workspace_id_group_id_id_key" ON "service_configurations"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "service_configurations_workspace_id_group_id_key" ON "service_configurations"("workspace_id", "group_id");
CREATE INDEX "service_configurations_workspace_id_visibility_starts_at_ends_at_idx" ON "service_configurations"("workspace_id", "visibility", "starts_at", "ends_at");

CREATE UNIQUE INDEX "service_brands_group_id_key" ON "service_brands"("group_id");
CREATE UNIQUE INDEX "service_brands_configuration_id_key" ON "service_brands"("configuration_id");
CREATE UNIQUE INDEX "service_brands_workspace_id_group_id_key" ON "service_brands"("workspace_id", "group_id");
CREATE UNIQUE INDEX "service_brands_workspace_id_group_id_configuration_id_key" ON "service_brands"("workspace_id", "group_id", "configuration_id");
CREATE INDEX "service_brands_workspace_id_group_id_idx" ON "service_brands"("workspace_id", "group_id");

CREATE UNIQUE INDEX "service_registration_policies_group_id_key" ON "service_registration_policies"("group_id");
CREATE UNIQUE INDEX "service_registration_policies_configuration_id_key" ON "service_registration_policies"("configuration_id");
CREATE UNIQUE INDEX "service_registration_policies_workspace_id_group_id_key" ON "service_registration_policies"("workspace_id", "group_id");
CREATE UNIQUE INDEX "service_registration_policies_workspace_id_group_id_configuration_id_key" ON "service_registration_policies"("workspace_id", "group_id", "configuration_id");
CREATE INDEX "service_registration_policies_workspace_id_group_id_mode_idx" ON "service_registration_policies"("workspace_id", "group_id", "mode");

CREATE INDEX "service_configuration_audits_workspace_id_group_id_occurred_at_idx" ON "service_configuration_audits"("workspace_id", "group_id", "occurred_at");
CREATE INDEX "service_configuration_audits_configuration_id_occurred_at_idx" ON "service_configuration_audits"("configuration_id", "occurred_at");

ALTER TABLE "service_configurations" ADD CONSTRAINT "service_configurations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_configurations" ADD CONSTRAINT "service_configurations_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_configurations" ADD CONSTRAINT "service_configurations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_configurations" ADD CONSTRAINT "service_configurations_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_brands" ADD CONSTRAINT "service_brands_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_brands" ADD CONSTRAINT "service_brands_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_brands" ADD CONSTRAINT "service_brands_workspace_id_group_id_configuration_id_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_registration_policies" ADD CONSTRAINT "service_registration_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_registration_policies" ADD CONSTRAINT "service_registration_policies_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_registration_policies" ADD CONSTRAINT "service_registration_policies_workspace_id_group_id_configuration_id_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_configuration_audits" ADD CONSTRAINT "service_configuration_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_configuration_audits" ADD CONSTRAINT "service_configuration_audits_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_configuration_audits" ADD CONSTRAINT "service_configuration_audits_workspace_id_group_id_configuration_id_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_configuration_audits" ADD CONSTRAINT "service_configuration_audits_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
