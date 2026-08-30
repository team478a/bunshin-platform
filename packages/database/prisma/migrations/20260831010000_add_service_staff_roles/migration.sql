CREATE TYPE "ServiceRole" AS ENUM (
  'SERVICE_OWNER',
  'SERVICE_ADMIN',
  'CONTENT_EDITOR',
  'PARTICIPANT'
);

ALTER TABLE "group_memberships"
ADD COLUMN "service_role" "ServiceRole" NOT NULL DEFAULT 'PARTICIPANT';

UPDATE "group_memberships" AS membership
SET "service_role" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "service_configurations" AS configuration
    WHERE configuration."group_id" = membership."group_id"
      AND configuration."created_by_user_id" = membership."user_id"
  ) THEN 'SERVICE_OWNER'::"ServiceRole"
  ELSE 'SERVICE_ADMIN'::"ServiceRole"
END
WHERE membership."role" = 'MANAGER';

CREATE INDEX "group_memberships_group_id_service_role_status_idx"
ON "group_memberships"("group_id", "service_role", "status");
