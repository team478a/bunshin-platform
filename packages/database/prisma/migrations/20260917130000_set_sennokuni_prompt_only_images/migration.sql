-- 千ノ国メディアでは、サービス内の画像生成を使わず、投稿案に含まれる
-- 画像用プロンプトを外部の画像生成サービスへ送る運用に固定する。
WITH target_groups AS (
  SELECT "workspace_id", "group_id"
  FROM "service_configurations"
  WHERE "slug" = 'sennokuni-media'
)
UPDATE "group_feature_policies" AS policy
SET
  "status" = 'DISABLED',
  "daily_limit" = NULL,
  "monthly_limit" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
FROM target_groups AS target
WHERE policy."workspace_id" = target."workspace_id"
  AND policy."group_id" = target."group_id"
  AND policy."feature_key" = 'SOCIAL.IMAGE_GENERATION';

WITH target_groups AS (
  SELECT "workspace_id", "group_id"
  FROM "service_configurations"
  WHERE "slug" = 'sennokuni-media'
)
UPDATE "group_member_feature_assignments" AS assignment
SET
  "status" = 'DISABLED',
  "daily_limit" = NULL,
  "monthly_limit" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
FROM target_groups AS target
WHERE assignment."workspace_id" = target."workspace_id"
  AND assignment."group_id" = target."group_id"
  AND assignment."feature_key" = 'SOCIAL.IMAGE_GENERATION';

WITH target_groups AS (
  SELECT "workspace_id", "group_id"
  FROM "service_configurations"
  WHERE "slug" = 'sennokuni-media'
)
UPDATE "service_commercial_settings" AS commercial
SET
  "monthly_image_generation_limit" = 0,
  "updated_at" = CURRENT_TIMESTAMP
FROM target_groups AS target
WHERE commercial."workspace_id" = target."workspace_id"
  AND commercial."group_id" = target."group_id";

WITH target_groups AS (
  SELECT "workspace_id", "group_id"
  FROM "service_configurations"
  WHERE "slug" = 'sennokuni-media'
)
UPDATE "service_point_reward_settings" AS reward
SET
  "status" = 'SUSPENDED',
  "updated_at" = CURRENT_TIMESTAMP
FROM target_groups AS target
WHERE reward."workspace_id" = target."workspace_id"
  AND reward."group_id" = target."group_id"
  AND reward."reward_type" = 'SOCIAL_IMAGE_GENERATION';

WITH target_groups AS (
  SELECT "workspace_id", "group_id"
  FROM "service_configurations"
  WHERE "slug" = 'sennokuni-media'
)
UPDATE "service_referral_reward_rules" AS rule
SET "status" = 'SUSPENDED'
FROM target_groups AS target
WHERE rule."workspace_id" = target."workspace_id"
  AND rule."group_id" = target."group_id"
  AND rule."status" = 'ACTIVE';
