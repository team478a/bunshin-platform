ALTER TABLE "workspace_invitations"
  ADD COLUMN "invitee_email" VARCHAR(320),
  ADD COLUMN "last_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "revoked_at" TIMESTAMPTZ(6),
  ADD COLUMN "accepted_at" TIMESTAMPTZ(6);

UPDATE "workspace_invitations"
SET "invitee_email" = 'manual-link@invitation.local'
WHERE "invitee_email" IS NULL;

ALTER TABLE "workspace_invitations"
  ALTER COLUMN "invitee_email" SET NOT NULL;

DROP INDEX IF EXISTS "workspace_invitations_workspace_id_status_idx";
CREATE INDEX "workspace_invitations_workspace_id_status_created_at_idx"
  ON "workspace_invitations"("workspace_id", "status", "created_at");
CREATE INDEX "workspace_invitations_workspace_id_invitee_email_status_idx"
  ON "workspace_invitations"("workspace_id", "invitee_email", "status");
