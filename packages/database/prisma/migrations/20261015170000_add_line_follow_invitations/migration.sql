CREATE TYPE "GroupInvitationSource" AS ENUM ('MANUAL', 'LINE_FOLLOW');

ALTER TABLE "group_invitations"
  ALTER COLUMN "created_by_user_id" DROP NOT NULL,
  ADD COLUMN "source" "GroupInvitationSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "source_event_id" VARCHAR(255);

CREATE UNIQUE INDEX "group_invitations_source_event_id_key"
  ON "group_invitations"("source_event_id");
