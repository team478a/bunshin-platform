CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "AuthProvider" AS ENUM ('LINE', 'EMAIL');
CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'ORGANIZATION');
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'OPERATOR', 'SUPPORT', 'READ_ONLY');
CREATE TYPE "PlatformAdminStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "display_name" VARCHAR(100) NOT NULL,
  "email" VARCHAR(320),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_identities" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "provider_user_id" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspaces" (
  "id" UUID NOT NULL,
  "type" "WorkspaceType" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_memberships" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "WorkspaceRole" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_admins" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "PlatformRole" NOT NULL,
  "status" "PlatformAdminStatus" NOT NULL DEFAULT 'ACTIVE',
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "users_status_idx" ON "users"("status");
CREATE UNIQUE INDEX "auth_identities_provider_provider_user_id_key" ON "auth_identities"("provider", "provider_user_id");
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");
CREATE INDEX "workspaces_status_idx" ON "workspaces"("status");
CREATE UNIQUE INDEX "workspace_memberships_workspace_id_user_id_key" ON "workspace_memberships"("workspace_id", "user_id");
CREATE INDEX "workspace_memberships_user_id_status_idx" ON "workspace_memberships"("user_id", "status");
CREATE UNIQUE INDEX "platform_admins_user_id_key" ON "platform_admins"("user_id");
CREATE INDEX "platform_admins_status_role_idx" ON "platform_admins"("status", "role");

ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
