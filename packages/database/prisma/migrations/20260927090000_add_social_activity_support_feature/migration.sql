INSERT INTO "feature_definitions" (
  "key", "parent_key", "name", "description", "status", "config_schema", "updated_at"
)
VALUES (
  'SOCIAL.ACTIVITY_SUPPORT',
  'SOCIAL',
  'SNS継続支援',
  '利用者の行動履歴から続けにくさの候補を検出し、本人確認後に小さな支援を提示する。',
  'ACTIVE',
  '{}'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = EXCLUDED."status",
  "updated_at" = CURRENT_TIMESTAMP;
