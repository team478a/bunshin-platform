CREATE TYPE "ServiceCustomDomainStatus" AS ENUM ('DRAFT', 'VERIFIED', 'ACTIVE', 'DISABLED');

CREATE TABLE "service_custom_domains" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "hostname" VARCHAR(253) NOT NULL,
  "status" "ServiceCustomDomainStatus" NOT NULL DEFAULT 'DRAFT',
  "verification_note" VARCHAR(1000),
  "verified_at" TIMESTAMPTZ(6),
  "activated_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_custom_domains_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_custom_domains_group_id_key" UNIQUE ("group_id"),
  CONSTRAINT "service_custom_domains_configuration_id_key" UNIQUE ("configuration_id"),
  CONSTRAINT "service_custom_domains_hostname_key" UNIQUE ("hostname"),
  CONSTRAINT "svc_custom_domain_workspace_group_key" UNIQUE ("workspace_id", "group_id"),
  CONSTRAINT "svc_custom_domain_workspace_group_config_key" UNIQUE ("workspace_id", "group_id", "configuration_id"),
  CONSTRAINT "svc_custom_domain_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "svc_custom_domain_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "svc_custom_domain_configuration_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "service_custom_domains_status_hostname_idx"
ON "service_custom_domains"("status", "hostname");
