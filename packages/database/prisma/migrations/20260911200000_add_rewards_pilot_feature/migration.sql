INSERT INTO "feature_definitions" ("key", "name", "description", "updated_at")
VALUES (
  'REWARDS',
  'ポイント・バッジ',
  '活動に応じたポイントとバッジの親機能',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = 'ACTIVE',
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "feature_definitions" ("key", "parent_key", "name", "description", "updated_at")
VALUES (
  'REWARDS.POINTS_BADGES',
  'REWARDS',
  'ポイント・バッジ（試験利用）',
  '許可した参加者だけポイントとバッジを利用する',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "parent_key" = EXCLUDED."parent_key",
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = 'ACTIVE',
  "updated_at" = CURRENT_TIMESTAMP;
