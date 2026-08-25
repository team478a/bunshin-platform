CREATE TYPE "ExternalTrackingSystemStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "ExternalTrackingDomainStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "ExternalTrackingMemberIdentityStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "ExternalTrackingLinkScopeType" AS ENUM ('GROUP', 'MEMBER', 'PRODUCT', 'CAMPAIGN', 'PRODUCT_MEMBER', 'CAMPAIGN_MEMBER');
CREATE TYPE "ExternalTrackingLinkStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'DELETED');

CREATE TABLE "external_tracking_systems" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "system_type" VARCHAR(80) NOT NULL,
  "external_system_id" VARCHAR(255),
  "status" "ExternalTrackingSystemStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "external_tracking_systems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_tracking_allowed_domains" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "system_id" UUID NOT NULL,
  "hostname" VARCHAR(253) NOT NULL,
  "allow_subdomains" BOOLEAN NOT NULL DEFAULT false,
  "shortener" BOOLEAN NOT NULL DEFAULT false,
  "status" "ExternalTrackingDomainStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "external_tracking_allowed_domains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_tracking_member_identities" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "system_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "common_user_id" VARCHAR(255),
  "agency_id" VARCHAR(255),
  "external_member_id" VARCHAR(255),
  "status" "ExternalTrackingMemberIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "external_tracking_member_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_tracking_links" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "system_id" UUID NOT NULL,
  "allowed_domain_id" UUID NOT NULL,
  "member_identity_id" UUID,
  "product_pack_id" UUID,
  "campaign_id" UUID,
  "scope_type" "ExternalTrackingLinkScopeType" NOT NULL,
  "scope_key" VARCHAR(500) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "external_link_id" VARCHAR(255),
  "referral_token" VARCHAR(500),
  "url" VARCHAR(2048) NOT NULL,
  "status" "ExternalTrackingLinkStatus" NOT NULL DEFAULT 'DRAFT',
  "starts_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "notes" VARCHAR(1000),
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "activated_at" TIMESTAMPTZ(6),
  "suspended_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "external_tracking_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_tracking_links_valid_period_check" CHECK ("starts_at" IS NULL OR "expires_at" IS NULL OR "starts_at" < "expires_at"),
  CONSTRAINT "external_tracking_links_scope_check" CHECK (
    ("scope_type" = 'GROUP' AND "member_identity_id" IS NULL AND "product_pack_id" IS NULL AND "campaign_id" IS NULL) OR
    ("scope_type" = 'MEMBER' AND "member_identity_id" IS NOT NULL AND "product_pack_id" IS NULL AND "campaign_id" IS NULL) OR
    ("scope_type" = 'PRODUCT' AND "member_identity_id" IS NULL AND "product_pack_id" IS NOT NULL AND "campaign_id" IS NULL) OR
    ("scope_type" = 'CAMPAIGN' AND "member_identity_id" IS NULL AND "product_pack_id" IS NULL AND "campaign_id" IS NOT NULL) OR
    ("scope_type" = 'PRODUCT_MEMBER' AND "member_identity_id" IS NOT NULL AND "product_pack_id" IS NOT NULL AND "campaign_id" IS NULL) OR
    ("scope_type" = 'CAMPAIGN_MEMBER' AND "member_identity_id" IS NOT NULL AND "product_pack_id" IS NULL AND "campaign_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "external_tracking_systems_workspace_id_group_id_name_key" ON "external_tracking_systems"("workspace_id", "group_id", "name");
CREATE INDEX "external_tracking_systems_group_id_status_idx" ON "external_tracking_systems"("group_id", "status");
CREATE UNIQUE INDEX "external_tracking_allowed_domains_system_id_hostname_key" ON "external_tracking_allowed_domains"("system_id", "hostname");
CREATE INDEX "external_tracking_allowed_domains_workspace_id_group_id_status_idx" ON "external_tracking_allowed_domains"("workspace_id", "group_id", "status");
CREATE UNIQUE INDEX "external_tracking_member_identities_system_id_group_membership_id_key" ON "external_tracking_member_identities"("system_id", "group_membership_id");
CREATE INDEX "external_tracking_member_identities_workspace_id_group_id_status_idx" ON "external_tracking_member_identities"("workspace_id", "group_id", "status");
CREATE INDEX "external_tracking_links_workspace_id_group_id_status_idx" ON "external_tracking_links"("workspace_id", "group_id", "status");
CREATE INDEX "external_tracking_links_system_id_scope_key_status_idx" ON "external_tracking_links"("system_id", "scope_key", "status");
CREATE INDEX "external_tracking_links_member_identity_id_status_idx" ON "external_tracking_links"("member_identity_id", "status");
CREATE INDEX "external_tracking_links_product_pack_id_status_idx" ON "external_tracking_links"("product_pack_id", "status");
CREATE INDEX "external_tracking_links_campaign_id_status_idx" ON "external_tracking_links"("campaign_id", "status");
CREATE UNIQUE INDEX "external_tracking_links_active_scope_key" ON "external_tracking_links"("system_id", "scope_key") WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL;

ALTER TABLE "external_tracking_systems" ADD CONSTRAINT "external_tracking_systems_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_systems" ADD CONSTRAINT "external_tracking_systems_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_systems" ADD CONSTRAINT "external_tracking_systems_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_systems" ADD CONSTRAINT "external_tracking_systems_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_allowed_domains" ADD CONSTRAINT "external_tracking_allowed_domains_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_allowed_domains" ADD CONSTRAINT "external_tracking_allowed_domains_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_allowed_domains" ADD CONSTRAINT "external_tracking_allowed_domains_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "external_tracking_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_allowed_domains" ADD CONSTRAINT "external_tracking_allowed_domains_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_allowed_domains" ADD CONSTRAINT "external_tracking_allowed_domains_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_member_identities" ADD CONSTRAINT "external_tracking_member_identities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_member_identities" ADD CONSTRAINT "external_tracking_member_identities_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_member_identities" ADD CONSTRAINT "external_tracking_member_identities_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "external_tracking_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_member_identities" ADD CONSTRAINT "external_tracking_member_identities_group_membership_id_fkey" FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_member_identities" ADD CONSTRAINT "external_tracking_member_identities_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_member_identities" ADD CONSTRAINT "external_tracking_member_identities_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_links" ADD CONSTRAINT "external_tracking_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_links" ADD CONSTRAINT "external_tracking_links_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_links" ADD CONSTRAINT "external_tracking_links_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "external_tracking_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_links" ADD CONSTRAINT "external_tracking_links_allowed_domain_id_fkey" FOREIGN KEY ("allowed_domain_id") REFERENCES "external_tracking_allowed_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_links" ADD CONSTRAINT "external_tracking_links_member_identity_id_fkey" FOREIGN KEY ("member_identity_id") REFERENCES "external_tracking_member_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_links" ADD CONSTRAINT "external_tracking_links_product_pack_id_fkey" FOREIGN KEY ("product_pack_id") REFERENCES "product_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_links" ADD CONSTRAINT "external_tracking_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_links" ADD CONSTRAINT "external_tracking_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_tracking_links" ADD CONSTRAINT "external_tracking_links_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
