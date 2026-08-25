CREATE TYPE "ProductPackStatus" AS ENUM ('DRAFT','ACTIVE','SUSPENDED','ARCHIVED');
CREATE TYPE "ProductPackVersionStatus" AS ENUM ('DRAFT','PUBLISHED','SUPERSEDED');
CREATE TYPE "ProductPackRuleType" AS ENUM ('REQUIRED_DISCLOSURE','FORBIDDEN_EXPRESSION','CONDITIONAL_EXPRESSION');
CREATE TYPE "ProductPackAssetType" AS ENUM ('IMAGE','VIDEO','DOCUMENT','LINK');
CREATE TYPE "ProductPackAssignmentStatus" AS ENUM ('ACTIVE','REVOKED');

CREATE TABLE "product_packs" ("id" UUID NOT NULL,"workspace_id" UUID NOT NULL,"group_id" UUID NOT NULL,"name" VARCHAR(160) NOT NULL,"status" "ProductPackStatus" NOT NULL DEFAULT 'DRAFT',"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMPTZ(6) NOT NULL,CONSTRAINT "product_packs_pkey" PRIMARY KEY ("id"));
CREATE TABLE "product_pack_versions" ("id" UUID NOT NULL,"product_pack_id" UUID NOT NULL,"version" INTEGER NOT NULL,"status" "ProductPackVersionStatus" NOT NULL DEFAULT 'DRAFT',"summary" VARCHAR(1000) NOT NULL,"provider_name" VARCHAR(200) NOT NULL,"target_customer" VARCHAR(1000) NOT NULL,"facts" JSONB NOT NULL,"faq" JSONB NOT NULL,"suitable_for" TEXT[],"unsuitable_for" TEXT[],"valid_from" TIMESTAMPTZ(6),"valid_until" TIMESTAMPTZ(6),"published_at" TIMESTAMPTZ(6),"superseded_at" TIMESTAMPTZ(6),"created_by_user_id" UUID NOT NULL,"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMPTZ(6) NOT NULL,CONSTRAINT "product_pack_versions_pkey" PRIMARY KEY ("id"));
CREATE TABLE "product_pack_rules" ("id" UUID NOT NULL,"product_pack_version_id" UUID NOT NULL,"type" "ProductPackRuleType" NOT NULL,"value" VARCHAR(1000) NOT NULL,"condition" VARCHAR(1000),"sort_order" INTEGER NOT NULL DEFAULT 0,"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "product_pack_rules_pkey" PRIMARY KEY ("id"));
CREATE TABLE "product_pack_assets" ("id" UUID NOT NULL,"product_pack_version_id" UUID NOT NULL,"type" "ProductPackAssetType" NOT NULL,"url" VARCHAR(2048) NOT NULL,"label" VARCHAR(200) NOT NULL,"usage_terms" VARCHAR(2000) NOT NULL,"valid_until" TIMESTAMPTZ(6),"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "product_pack_assets_pkey" PRIMARY KEY ("id"));
CREATE TABLE "product_pack_assignments" ("id" UUID NOT NULL,"workspace_id" UUID NOT NULL,"product_pack_id" UUID NOT NULL,"product_pack_version_id" UUID NOT NULL,"bunshin_id" UUID NOT NULL,"status" "ProductPackAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',"consented_at" TIMESTAMPTZ(6) NOT NULL,"assigned_by_user_id" UUID NOT NULL,"revoked_at" TIMESTAMPTZ(6),"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMPTZ(6) NOT NULL,CONSTRAINT "product_pack_assignments_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "product_packs_workspace_id_group_id_name_key" ON "product_packs"("workspace_id","group_id","name");
CREATE INDEX "product_packs_workspace_id_status_idx" ON "product_packs"("workspace_id","status");
CREATE UNIQUE INDEX "product_pack_versions_product_pack_id_version_key" ON "product_pack_versions"("product_pack_id","version");
CREATE UNIQUE INDEX "product_pack_one_published_version" ON "product_pack_versions"("product_pack_id") WHERE "status"='PUBLISHED';
CREATE INDEX "product_pack_rules_product_pack_version_id_type_idx" ON "product_pack_rules"("product_pack_version_id","type");
CREATE INDEX "product_pack_assets_product_pack_version_id_type_idx" ON "product_pack_assets"("product_pack_version_id","type");
CREATE UNIQUE INDEX "product_pack_assignments_product_pack_id_bunshin_id_key" ON "product_pack_assignments"("product_pack_id","bunshin_id");
CREATE UNIQUE INDEX "product_pack_one_active_per_bunshin" ON "product_pack_assignments"("bunshin_id") WHERE "status"='ACTIVE';
CREATE INDEX "product_pack_assignments_workspace_id_bunshin_id_status_idx" ON "product_pack_assignments"("workspace_id","bunshin_id","status");

ALTER TABLE "product_packs" ADD CONSTRAINT "product_packs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_packs" ADD CONSTRAINT "product_packs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_pack_versions" ADD CONSTRAINT "product_pack_versions_product_pack_id_fkey" FOREIGN KEY ("product_pack_id") REFERENCES "product_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_pack_rules" ADD CONSTRAINT "product_pack_rules_product_pack_version_id_fkey" FOREIGN KEY ("product_pack_version_id") REFERENCES "product_pack_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_pack_assets" ADD CONSTRAINT "product_pack_assets_product_pack_version_id_fkey" FOREIGN KEY ("product_pack_version_id") REFERENCES "product_pack_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_pack_assignments" ADD CONSTRAINT "product_pack_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_pack_assignments" ADD CONSTRAINT "product_pack_assignments_product_pack_id_fkey" FOREIGN KEY ("product_pack_id") REFERENCES "product_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_pack_assignments" ADD CONSTRAINT "product_pack_assignments_product_pack_version_id_fkey" FOREIGN KEY ("product_pack_version_id") REFERENCES "product_pack_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_pack_assignments" ADD CONSTRAINT "product_pack_assignments_bunshin_id_fkey" FOREIGN KEY ("bunshin_id") REFERENCES "bunshins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
