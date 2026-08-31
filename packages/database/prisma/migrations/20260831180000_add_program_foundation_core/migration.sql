CREATE TYPE "ProgramTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "ProgramTemplateVisibility" AS ENUM ('PLATFORM', 'PRIVATE');
CREATE TYPE "ProgramVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "ServiceProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "ProgramOfferingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'SUPERSEDED');
CREATE TYPE "ProgramEnrollmentStatus" AS ENUM ('INVITED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "ProgramSupportMode" AS ENUM ('IDEA_ONLY', 'GUIDED', 'READY_TO_USE');
CREATE TYPE "ProgramResponsibilityOwner" AS ENUM ('PLATFORM', 'SERVICE');

CREATE TABLE "program_templates" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "owner_group_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(2000) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "target_audience" VARCHAR(500) NOT NULL,
  "status" "ProgramTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "visibility" "ProgramTemplateVisibility" NOT NULL DEFAULT 'PRIVATE',
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "program_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_templates_owner_scope_check" CHECK (
    ("visibility" = 'PLATFORM' AND "owner_group_id" IS NULL) OR
    ("visibility" = 'PRIVATE' AND "owner_group_id" IS NOT NULL)
  )
);

CREATE TABLE "program_template_versions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "program_template_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ProgramVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "definition" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "program_template_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_template_versions_version_check" CHECK ("version" > 0),
  CONSTRAINT "program_template_versions_publish_check" CHECK (
    ("status" = 'DRAFT' AND "published_at" IS NULL) OR
    ("status" <> 'DRAFT' AND "published_at" IS NOT NULL)
  )
);

CREATE TABLE "service_programs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_template_version_id" UUID NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(2000) NOT NULL,
  "status" "ServiceProgramStatus" NOT NULL DEFAULT 'DRAFT',
  "settings" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "service_programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "program_offerings" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "service_program_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ProgramOfferingStatus" NOT NULL DEFAULT 'DRAFT',
  "is_free" BOOLEAN NOT NULL DEFAULT true,
  "price_reference" VARCHAR(160),
  "seller" "ProgramResponsibilityOwner" NOT NULL,
  "price_owner" "ProgramResponsibilityOwner" NOT NULL,
  "payment_owner" "ProgramResponsibilityOwner" NOT NULL,
  "api_cost_owner" "ProgramResponsibilityOwner" NOT NULL,
  "support_owner" "ProgramResponsibilityOwner" NOT NULL,
  "content_owner" "ProgramResponsibilityOwner" NOT NULL,
  "character_owner" "ProgramResponsibilityOwner" NOT NULL,
  "terms_snapshot" JSONB NOT NULL,
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "program_offerings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_offerings_version_check" CHECK ("version" > 0),
  CONSTRAINT "program_offerings_period_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "starts_at" < "ends_at"),
  CONSTRAINT "program_offerings_price_check" CHECK (
    ("is_free" = true AND "price_reference" IS NULL) OR
    ("is_free" = false AND "price_reference" IS NOT NULL)
  )
);

CREATE TABLE "program_enrollments" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "service_program_id" UUID NOT NULL,
  "program_offering_id" UUID NOT NULL,
  "status" "ProgramEnrollmentStatus" NOT NULL DEFAULT 'INVITED',
  "support_mode" "ProgramSupportMode" NOT NULL,
  "goal_snapshot" JSONB NOT NULL,
  "offering_snapshot" JSONB NOT NULL,
  "invited_by_user_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "program_enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_enrollments_period_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "starts_at" < "ends_at")
);

CREATE TABLE "program_audit_logs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID,
  "resource_type" VARCHAR(80) NOT NULL,
  "resource_id" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB NOT NULL,
  "performed_by_user_id" UUID NOT NULL,
  "performed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "program_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_templates_workspace_id_id_key" ON "program_templates"("workspace_id", "id");
CREATE INDEX "program_templates_scope_idx" ON "program_templates"("workspace_id", "owner_group_id", "status");
CREATE UNIQUE INDEX "program_template_versions_template_version_key" ON "program_template_versions"("program_template_id", "version");
CREATE UNIQUE INDEX "program_template_versions_workspace_id_id_key" ON "program_template_versions"("workspace_id", "id");
CREATE INDEX "program_template_versions_scope_idx" ON "program_template_versions"("workspace_id", "program_template_id", "status");
CREATE UNIQUE INDEX "service_programs_workspace_group_id_key" ON "service_programs"("workspace_id", "group_id", "id");
CREATE INDEX "service_programs_scope_idx" ON "service_programs"("workspace_id", "group_id", "status");
CREATE UNIQUE INDEX "program_offerings_program_version_key" ON "program_offerings"("service_program_id", "version");
CREATE UNIQUE INDEX "program_offerings_workspace_group_id_key" ON "program_offerings"("workspace_id", "group_id", "id");
CREATE INDEX "program_offerings_scope_idx" ON "program_offerings"("workspace_id", "group_id", "status");
CREATE UNIQUE INDEX "program_enrollments_membership_program_key" ON "program_enrollments"("group_membership_id", "service_program_id");
CREATE UNIQUE INDEX "program_enrollments_workspace_group_id_key" ON "program_enrollments"("workspace_id", "group_id", "id");
CREATE INDEX "program_enrollments_scope_idx" ON "program_enrollments"("workspace_id", "group_id", "group_membership_id", "status");
CREATE INDEX "program_audit_logs_resource_idx" ON "program_audit_logs"("workspace_id", "group_id", "resource_type", "resource_id", "performed_at");

ALTER TABLE "program_templates" ADD CONSTRAINT "program_templates_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_templates" ADD CONSTRAINT "program_templates_owner_group_fkey" FOREIGN KEY ("workspace_id", "owner_group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_template_versions" ADD CONSTRAINT "program_template_versions_template_fkey" FOREIGN KEY ("workspace_id", "program_template_id") REFERENCES "program_templates"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_programs" ADD CONSTRAINT "service_programs_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_programs" ADD CONSTRAINT "service_programs_template_version_fkey" FOREIGN KEY ("workspace_id", "program_template_version_id") REFERENCES "program_template_versions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_offerings" ADD CONSTRAINT "program_offerings_service_program_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_program_id") REFERENCES "service_programs"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_service_program_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_program_id") REFERENCES "service_programs"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_offering_fkey" FOREIGN KEY ("workspace_id", "group_id", "program_offering_id") REFERENCES "program_offerings"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_audit_logs" ADD CONSTRAINT "program_audit_logs_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
