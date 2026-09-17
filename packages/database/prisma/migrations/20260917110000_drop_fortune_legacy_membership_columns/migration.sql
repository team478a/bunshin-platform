-- Fortune notification consent and membership lifecycle now use the shared Service stores.
-- Legacy notification opt-ins were copied by 20260916160000_align_fortune_membership.
DROP INDEX IF EXISTS "fortune_participants_service_setting_id_withdrawn_at_idx";

ALTER TABLE "fortune_participants"
  DROP COLUMN IF EXISTS "notification_enabled",
  DROP COLUMN IF EXISTS "withdrawn_at";
