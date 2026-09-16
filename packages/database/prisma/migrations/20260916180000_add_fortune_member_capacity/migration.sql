-- The v1 fortune package starts as a free, limited release for at most 100 participants.
-- Preserve any commercial setting already configured by a system administrator.
INSERT INTO "service_commercial_settings" (
  "id",
  "workspace_id",
  "group_id",
  "configuration_id",
  "plan_name",
  "billing_mode",
  "status",
  "monthly_price_yen",
  "included_member_limit",
  "monthly_ai_generation_limit",
  "monthly_image_generation_limit",
  "monthly_video_generation_limit",
  "starts_at",
  "ends_at",
  "updated_by_user_id",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  fortune."workspace_id",
  fortune."group_id",
  fortune."configuration_id",
  '占い限定公開 v1',
  'FREE'::"ServiceBillingMode",
  'ACTIVE'::"ServiceCommercialStatus",
  NULL,
  100,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  configuration."updated_by_user_id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "fortune_service_settings" AS fortune
INNER JOIN "service_configurations" AS configuration
  ON configuration."id" = fortune."configuration_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "service_commercial_settings" AS commercial
  WHERE commercial."group_id" = fortune."group_id"
);
