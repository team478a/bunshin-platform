UPDATE "service_registration_policies" AS policy
SET
  "onboarding_config" = replace(
    "onboarding_config"::text,
    '千ノ国メタバース',
    '千ノ国メディア'
  )::jsonb,
  "survey_config" = replace(
    "survey_config"::text,
    '千ノ国メタバース',
    '千ノ国メディア'
  )::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
FROM "service_configurations" AS configuration
WHERE policy."configuration_id" = configuration."id"
  AND configuration."slug" = 'sennokuni-media'
  AND (
    policy."onboarding_config"::text LIKE '%千ノ国メタバース%'
    OR policy."survey_config"::text LIKE '%千ノ国メタバース%'
  );
