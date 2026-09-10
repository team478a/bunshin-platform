-- The common badge processor only evaluates published SYSTEM badges. Seed the
-- approved initial catalog so free users can earn badges without an admin setup
-- step. IDs are stable to keep this migration idempotent across environments.
WITH catalog (
  definition_id, version_id, code, category, title, description,
  condition_type, event_type, target
) AS (
  VALUES
    ('21000000-0000-4000-8000-000000000001'::uuid, '22000000-0000-4000-8000-000000000001'::uuid, 'FIRST_PERSONA', 'START', 'はじめの一歩', 'はじめて分身を作りました', 'FIRST'::"BadgeConditionType", 'BUNSHIN_CREATED', 1),
    ('21000000-0000-4000-8000-000000000002'::uuid, '22000000-0000-4000-8000-000000000002'::uuid, 'STRATEGY_READY', 'START', '発信準備完了', 'SNSの発信戦略を承認しました', 'FIRST'::"BadgeConditionType", 'STRATEGY_APPROVED', 1),
    ('21000000-0000-4000-8000-000000000003'::uuid, '22000000-0000-4000-8000-000000000003'::uuid, 'FIRST_PLAN_VIEW', 'START', '初めての企画', 'はじめて今日の企画を確認しました', 'FIRST'::"BadgeConditionType", 'MISSION_VIEWED', 1),
    ('21000000-0000-4000-8000-000000000004'::uuid, '22000000-0000-4000-8000-000000000004'::uuid, 'FIRST_ADOPTION', 'START', '初めての採用', 'はじめて投稿案を採用しました', 'FIRST'::"BadgeConditionType", 'MISSION_ACCEPTED', 1),
    ('21000000-0000-4000-8000-000000000005'::uuid, '22000000-0000-4000-8000-000000000005'::uuid, 'FIRST_POST', 'START', '初投稿', 'はじめて投稿完了を記録しました', 'FIRST'::"BadgeConditionType", 'POSTED', 1),
    ('21000000-0000-4000-8000-000000000006'::uuid, '22000000-0000-4000-8000-000000000006'::uuid, 'FIRST_FEEDBACK', 'START', '振り返り上手', 'はじめて投稿を振り返りました', 'FIRST'::"BadgeConditionType", 'FEEDBACK_RECORDED', 1),
    ('21000000-0000-4000-8000-000000000007'::uuid, '22000000-0000-4000-8000-000000000007'::uuid, 'VIEW_STREAK_3', 'CONTINUITY', '3日続けて確認', '3日連続で今日の企画を確認しました', 'STREAK_DAILY'::"BadgeConditionType", 'MISSION_VIEWED', 3),
    ('21000000-0000-4000-8000-000000000008'::uuid, '22000000-0000-4000-8000-000000000008'::uuid, 'VIEW_STREAK_7', 'CONTINUITY', '1週間続けて確認', '7日連続で今日の企画を確認しました', 'STREAK_DAILY'::"BadgeConditionType", 'MISSION_VIEWED', 7),
    ('21000000-0000-4000-8000-000000000009'::uuid, '22000000-0000-4000-8000-000000000009'::uuid, 'WEEKLY_POST_4', 'CONTINUITY', '4週間継続', '4週連続で投稿完了を記録しました', 'STREAK_WEEKLY'::"BadgeConditionType", 'POSTED', 4),
    ('21000000-0000-4000-8000-000000000010'::uuid, '22000000-0000-4000-8000-000000000010'::uuid, 'IMAGE_FIRST', 'CHALLENGE', '画像づくりに挑戦', 'はじめて画像生成を完了しました', 'FIRST'::"BadgeConditionType", 'IMAGE_COMPLETED', 1)
), inserted_definitions AS (
  INSERT INTO "badge_definitions" (
    "id", "owner_type", "code", "category", "status", "current_version", "created_at", "updated_at"
  )
  SELECT definition_id, 'SYSTEM'::"BadgeOwnerType", code, category,
    'ACTIVE'::"BadgeDefinitionStatus", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM catalog
  ON CONFLICT DO NOTHING
  RETURNING "id", "code"
), resolved_definitions AS (
  SELECT "id", "code"
  FROM "badge_definitions"
  WHERE "owner_type" = 'SYSTEM' AND "workspace_id" IS NULL AND "group_id" IS NULL
  UNION ALL
  SELECT "id", "code" FROM inserted_definitions
)
INSERT INTO "badge_versions" (
  "id", "definition_id", "version", "title", "description", "image_key", "alt_text",
  "condition_type", "condition_config", "visibility_policy", "reward_policy",
  "published_at", "created_at"
)
SELECT
  catalog.version_id, definition."id", 1, catalog.title, catalog.description,
  'badges/' || lower(catalog.code) || '.svg', catalog.title,
  catalog.condition_type,
  jsonb_build_object(
    'schemaVersion', 1,
    'eventType', catalog.event_type,
    'target', catalog.target,
    'timezonePolicy', 'USER_OR_ASIA_TOKYO',
    'weekStartsOn', 'MONDAY'
  ),
  'PRIVATE'::"BadgeVisibilityPolicy",
  '{"type":"NONE"}'::jsonb,
  '2026-08-29T00:00:00Z'::timestamptz,
  CURRENT_TIMESTAMP
FROM catalog
JOIN resolved_definitions definition ON definition."code" = catalog.code
ON CONFLICT DO NOTHING;
