-- Preserve legacy Fortune LINE opt-ins in the common service preference store.
-- Existing common preferences win, including an explicit opt-out.
INSERT INTO "service_notification_preferences" (
  "id",
  "workspace_id",
  "group_id",
  "group_membership_id",
  "user_id",
  "topic",
  "channel",
  "enabled",
  "consented_at",
  "opted_out_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  participant."workspace_id",
  participant."group_id",
  participant."group_membership_id",
  participant."user_id",
  'FORTUNE_WEEKLY',
  'LINE'::"ServiceNotificationChannel",
  true,
  participant."updated_at",
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "fortune_participants" AS participant
INNER JOIN "group_memberships" AS membership
  ON membership."workspace_id" = participant."workspace_id"
 AND membership."group_id" = participant."group_id"
 AND membership."id" = participant."group_membership_id"
 AND membership."user_id" = participant."user_id"
WHERE participant."notification_enabled" = true
  AND participant."withdrawn_at" IS NULL
  AND membership."status" = 'ACTIVE'
  AND membership."consented_at" IS NOT NULL
ON CONFLICT (
  "workspace_id",
  "group_id",
  "group_membership_id",
  "topic",
  "channel"
) DO NOTHING;

COMMENT ON COLUMN "fortune_participants"."notification_enabled" IS
  'Legacy compatibility only. Use service_notification_preferences topic FORTUNE_WEEKLY.';
COMMENT ON COLUMN "fortune_participants"."withdrawn_at" IS
  'Legacy compatibility only. GroupMembership.status is the participation source of truth.';
