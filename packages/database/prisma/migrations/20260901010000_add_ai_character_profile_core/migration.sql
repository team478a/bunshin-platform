CREATE TYPE "AiCharacterProfileScope" AS ENUM ('PLATFORM', 'SERVICE', 'PERSONAL');
CREATE TYPE "AiCharacterProfileStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "AiCharacterVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "AiCharacterReferenceAssetStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'REJECTED', 'DELETED');

CREATE TABLE "ai_character_profiles" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "group_id" UUID, "owner_user_id" UUID,
  "scope" "AiCharacterProfileScope" NOT NULL, "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000) NOT NULL, "status" "AiCharacterProfileStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_character_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_character_profiles_owner_check" CHECK (
    ("scope" = 'PLATFORM' AND "group_id" IS NULL AND "owner_user_id" IS NULL) OR
    ("scope" = 'SERVICE' AND "group_id" IS NOT NULL AND "owner_user_id" IS NULL) OR
    ("scope" = 'PERSONAL' AND "group_id" IS NOT NULL AND "owner_user_id" IS NOT NULL)
  )
);
CREATE TABLE "ai_character_license_versions" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "group_id" UUID, "character_profile_id" UUID NOT NULL,
  "version" INTEGER NOT NULL, "rights_holder" VARCHAR(300) NOT NULL, "commercial_use_allowed" BOOLEAN NOT NULL,
  "derivative_use_allowed" BOOLEAN NOT NULL, "redistribution_allowed" BOOLEAN NOT NULL,
  "terms" VARCHAR(3000) NOT NULL, "starts_at" TIMESTAMPTZ(3) NOT NULL, "ends_at" TIMESTAMPTZ(3),
  "consent_recorded_at" TIMESTAMPTZ(3) NOT NULL, "recorded_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_character_license_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_character_license_versions_version_check" CHECK ("version" > 0),
  CONSTRAINT "ai_character_license_versions_period_check" CHECK ("ends_at" IS NULL OR "starts_at" < "ends_at")
);
CREATE TABLE "ai_character_profile_versions" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "group_id" UUID, "character_profile_id" UUID NOT NULL,
  "license_version_id" UUID NOT NULL, "version" INTEGER NOT NULL,
  "status" "AiCharacterVersionStatus" NOT NULL DEFAULT 'DRAFT', "appearance" VARCHAR(2000) NOT NULL,
  "world_setting" VARCHAR(2000) NOT NULL, "base_prompt" VARCHAR(5000) NOT NULL,
  "negative_prompt" VARCHAR(3000) NOT NULL, "safety_rules" JSONB NOT NULL, "license_snapshot" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL, "published_at" TIMESTAMPTZ(3), "superseded_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_character_profile_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_character_profile_versions_version_check" CHECK ("version" > 0),
  CONSTRAINT "ai_character_profile_versions_publish_check" CHECK (("status" = 'DRAFT' AND "published_at" IS NULL) OR ("status" <> 'DRAFT' AND "published_at" IS NOT NULL))
);
CREATE TABLE "ai_character_reference_assets" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "group_id" UUID, "character_profile_version_id" UUID NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL, "original_filename" VARCHAR(255) NOT NULL, "mime_type" VARCHAR(100) NOT NULL,
  "size_bytes" INTEGER NOT NULL, "sha256" CHAR(64) NOT NULL,
  "status" "AiCharacterReferenceAssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
  "rights_confirmed_at" TIMESTAMPTZ(3) NOT NULL, "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_character_reference_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_character_reference_assets_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 20000000),
  CONSTRAINT "ai_character_reference_assets_sha_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "ai_character_profiles_workspace_id_id_key" ON "ai_character_profiles"("workspace_id", "id");
CREATE UNIQUE INDEX "ai_character_profiles_workspace_group_id_id_key" ON "ai_character_profiles"("workspace_id", "group_id", "id");
CREATE INDEX "ai_character_profiles_scope_idx" ON "ai_character_profiles"("workspace_id", "group_id", "owner_user_id", "status");
CREATE UNIQUE INDEX "ai_character_license_versions_profile_version_key" ON "ai_character_license_versions"("character_profile_id", "version");
CREATE UNIQUE INDEX "ai_character_license_versions_workspace_id_id_key" ON "ai_character_license_versions"("workspace_id", "id");
CREATE INDEX "ai_character_license_versions_scope_idx" ON "ai_character_license_versions"("workspace_id", "group_id", "character_profile_id");
CREATE UNIQUE INDEX "ai_character_profile_versions_profile_version_key" ON "ai_character_profile_versions"("character_profile_id", "version");
CREATE UNIQUE INDEX "ai_character_profile_versions_workspace_id_id_key" ON "ai_character_profile_versions"("workspace_id", "id");
CREATE UNIQUE INDEX "ai_character_profile_versions_workspace_group_id_id_key" ON "ai_character_profile_versions"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "ai_character_profile_versions_published_key" ON "ai_character_profile_versions"("workspace_id", "character_profile_id") WHERE "status" = 'PUBLISHED';
CREATE INDEX "ai_character_profile_versions_scope_idx" ON "ai_character_profile_versions"("workspace_id", "group_id", "character_profile_id", "status");
CREATE UNIQUE INDEX "ai_character_reference_assets_workspace_id_id_key" ON "ai_character_reference_assets"("workspace_id", "id");
CREATE INDEX "ai_character_reference_assets_scope_idx" ON "ai_character_reference_assets"("workspace_id", "group_id", "character_profile_version_id", "status");

ALTER TABLE "ai_character_profiles" ADD CONSTRAINT "ai_character_profiles_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_character_profiles" ADD CONSTRAINT "ai_character_profiles_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_character_license_versions" ADD CONSTRAINT "ai_character_license_versions_profile_fkey" FOREIGN KEY ("workspace_id", "character_profile_id") REFERENCES "ai_character_profiles"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_character_license_versions" ADD CONSTRAINT "ai_character_license_versions_profile_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "character_profile_id") REFERENCES "ai_character_profiles"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_character_profile_versions" ADD CONSTRAINT "ai_character_profile_versions_profile_fkey" FOREIGN KEY ("workspace_id", "character_profile_id") REFERENCES "ai_character_profiles"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_character_profile_versions" ADD CONSTRAINT "ai_character_profile_versions_profile_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "character_profile_id") REFERENCES "ai_character_profiles"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_character_profile_versions" ADD CONSTRAINT "ai_character_profile_versions_license_fkey" FOREIGN KEY ("workspace_id", "license_version_id") REFERENCES "ai_character_license_versions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_character_reference_assets" ADD CONSTRAINT "ai_character_reference_assets_version_fkey" FOREIGN KEY ("workspace_id", "character_profile_version_id") REFERENCES "ai_character_profile_versions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_character_reference_assets" ADD CONSTRAINT "ai_character_reference_assets_version_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "character_profile_version_id") REFERENCES "ai_character_profile_versions"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
