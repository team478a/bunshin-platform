CREATE TYPE "GroupStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "GroupRole" AS ENUM ('MANAGER', 'PARTICIPANT');
CREATE TYPE "GroupMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DECLINED', 'REVOKED');
CREATE TYPE "GroupInvitationStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED');

CREATE TABLE "groups" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" "GroupStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_memberships" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "GroupRole" NOT NULL DEFAULT 'PARTICIPANT',
  "status" "GroupMembershipStatus" NOT NULL DEFAULT 'INVITED',
  "consented_at" TIMESTAMPTZ(6),
  "declined_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_memberships_state_check" CHECK (
    ("status" = 'ACTIVE' AND "consented_at" IS NOT NULL AND "revoked_at" IS NULL)
    OR ("status" = 'DECLINED' AND "declined_at" IS NOT NULL)
    OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
    OR "status" = 'INVITED'
  )
);

CREATE TABLE "group_invitations" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "role" "GroupRole" NOT NULL DEFAULT 'PARTICIPANT',
  "status" "GroupInvitationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "max_uses" INTEGER NOT NULL DEFAULT 1,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "group_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_invitations_usage_check" CHECK ("max_uses" > 0 AND "used_count" >= 0 AND "used_count" <= "max_uses")
);

CREATE UNIQUE INDEX "groups_workspace_id_name_key" ON "groups"("workspace_id", "name");
CREATE INDEX "groups_workspace_id_status_idx" ON "groups"("workspace_id", "status");
CREATE UNIQUE INDEX "group_memberships_group_id_user_id_key" ON "group_memberships"("group_id", "user_id");
CREATE INDEX "group_memberships_workspace_id_user_id_status_idx" ON "group_memberships"("workspace_id", "user_id", "status");
CREATE INDEX "group_memberships_group_id_status_idx" ON "group_memberships"("group_id", "status");
CREATE UNIQUE INDEX "group_invitations_token_hash_key" ON "group_invitations"("token_hash");
CREATE INDEX "group_invitations_workspace_id_group_id_status_idx" ON "group_invitations"("workspace_id", "group_id", "status");
CREATE INDEX "group_invitations_expires_at_status_idx" ON "group_invitations"("expires_at", "status");

ALTER TABLE "groups" ADD CONSTRAINT "groups_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
