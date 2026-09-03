CREATE TYPE "WorkspaceInvitationStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'REVOKED');

ALTER TABLE "workspaces"
  ADD COLUMN "legal_name" VARCHAR(200),
  ADD COLUMN "description" VARCHAR(2000),
  ADD COLUMN "contact_name" VARCHAR(120),
  ADD COLUMN "contact_email" VARCHAR(320),
  ADD COLUMN "contact_phone" VARCHAR(40),
  ADD COLUMN "website_url" VARCHAR(2048),
  ADD COLUMN "address" VARCHAR(500);

CREATE TABLE "workspace_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'ADMIN',
  "status" "WorkspaceInvitationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "max_uses" INTEGER NOT NULL DEFAULT 1,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_invitations_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "workspace_invitations_workspace_id_status_idx"
ON "workspace_invitations"("workspace_id", "status");

CREATE INDEX "workspace_invitations_expires_at_status_idx"
ON "workspace_invitations"("expires_at", "status");
