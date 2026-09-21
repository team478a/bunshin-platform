-- Repair already-generated Sennokuni content so old OVE wording is not shown again.
-- Keep the replacement scoped through Bunshin -> Group -> ServiceConfiguration.
UPDATE "daily_missions" AS mission
SET
  "topic" = regexp_replace(mission."topic", '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)', E'\\1ORI\\2', 'gi'),
  "angle" = regexp_replace(mission."angle", '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)', E'\\1ORI\\2', 'gi'),
  "reason" = regexp_replace(mission."reason", '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)', E'\\1ORI\\2', 'gi'),
  "updated_at" = CURRENT_TIMESTAMP
FROM "bunshins" AS bunshin
INNER JOIN "service_configurations" AS configuration
  ON configuration."group_id" = bunshin."group_id"
 AND configuration."workspace_id" = bunshin."workspace_id"
WHERE mission."bunshin_id" = bunshin."id"
  AND mission."workspace_id" = bunshin."workspace_id"
  AND configuration."slug" = 'sennokuni-media'
  AND (
    mission."topic" ~* '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)'
    OR mission."angle" ~* '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)'
    OR mission."reason" ~* '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)'
  );

UPDATE "mission_contents" AS content
SET
  "content_json" = regexp_replace(
    content."content_json"::text,
    '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)',
    E'\\1ORI\\2',
    'gi'
  )::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
FROM "bunshins" AS bunshin
INNER JOIN "service_configurations" AS configuration
  ON configuration."group_id" = bunshin."group_id"
 AND configuration."workspace_id" = bunshin."workspace_id"
WHERE content."bunshin_id" = bunshin."id"
  AND content."workspace_id" = bunshin."workspace_id"
  AND configuration."slug" = 'sennokuni-media'
  AND content."content_json"::text ~* '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)';

UPDATE "mission_content_variants" AS variant
SET "content_json" = regexp_replace(
  variant."content_json"::text,
  '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)',
  E'\\1ORI\\2',
  'gi'
)::jsonb
FROM "bunshins" AS bunshin
INNER JOIN "service_configurations" AS configuration
  ON configuration."group_id" = bunshin."group_id"
 AND configuration."workspace_id" = bunshin."workspace_id"
WHERE variant."bunshin_id" = bunshin."id"
  AND variant."workspace_id" = bunshin."workspace_id"
  AND configuration."slug" = 'sennokuni-media'
  AND variant."content_json"::text ~* '(^|[^A-Za-z0-9])OVE([^A-Za-z0-9]|$)';
