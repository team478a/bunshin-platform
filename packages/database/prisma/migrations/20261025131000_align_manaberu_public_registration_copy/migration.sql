-- The Manaberu registration policy is PUBLIC. Keep the public description aligned
-- with the actual policy so users are not told that registration is invitation-only.
DO $$
DECLARE
  target RECORD;
  actor_user_id UUID;
  next_description CONSTANT TEXT := 'マナベルスタイルは、受講者本人がAIを使って、自分でできることを増やすための個別学習サービスです。目標づくり、実践、回答へのフィードバック、復習を支援します。完成品の制作や業務の実行を代行するサービスではありません。現在は無料Pilotとして提供しています。';
BEGIN
  SELECT
    sc."id",
    sc."workspace_id",
    sc."group_id",
    sc."slug",
    sc."description",
    sc."updated_by_user_id",
    g."name" AS group_name
  INTO target
  FROM "service_configurations" sc
  INNER JOIN "groups" g
    ON g."workspace_id" = sc."workspace_id"
   AND g."id" = sc."group_id"
  WHERE sc."id" = '1b74ed83-977a-4a54-9750-ab381c5d8367'::UUID
    AND sc."workspace_id" = '74000000-0000-4000-8000-000000000001'::UUID
    AND sc."group_id" = 'ae9e96ca-16f3-4210-af4f-44d18bdaebe3'::UUID
    AND sc."slug" = 'manaberu-style';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manaberu public-copy repair target is missing or mismatched';
  END IF;

  IF target.group_name <> 'マナベルスタイル' THEN
    RAISE EXCEPTION 'Manaberu public-copy repair target group is unexpected: %', target.group_name;
  END IF;

  IF target.description = next_description THEN
    RAISE NOTICE 'Manaberu public registration copy is already canonical';
    RETURN;
  END IF;

  actor_user_id := target.updated_by_user_id;
  IF actor_user_id IS NULL THEN
    SELECT pa."user_id"
    INTO actor_user_id
    FROM "platform_admins" pa
    WHERE pa."role" = 'SUPER_ADMIN'
      AND pa."status" = 'ACTIVE'
    ORDER BY pa."granted_at", pa."user_id"
    LIMIT 1;
  END IF;

  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Manaberu public-copy repair requires an active operator';
  END IF;

  UPDATE "service_configurations"
  SET
    "description" = next_description,
    "updated_by_user_id" = actor_user_id,
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = target.id;

  INSERT INTO "service_configuration_audits" (
    "id", "workspace_id", "group_id", "configuration_id", "action",
    "before_data", "after_data", "reason", "performed_by_user_id", "occurred_at"
  ) VALUES (
    gen_random_uuid(),
    target.workspace_id,
    target.group_id,
    target.id,
    'UPDATED',
    jsonb_build_object('slug', target.slug, 'description', target.description),
    jsonb_build_object('slug', target.slug, 'description', next_description),
    'マナベルスタイルの一般公開登録設定と案内文を一致させる',
    actor_user_id,
    CURRENT_TIMESTAMP
  );
END $$;
