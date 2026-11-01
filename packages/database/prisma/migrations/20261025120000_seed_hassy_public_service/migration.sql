-- Restore HASSY as an independently owned public service.
--
-- This migration is intentionally idempotent.  It does not reuse the
-- Manaberu group or any other service's registration records.  A workspace
-- created by the official-service seed is the only allowed owner boundary.
DO $$
DECLARE
  operator_user_id UUID;
  target_workspace_id UUID;
  target_group_id UUID;
  membership_id UUID;
  configuration_id UUID;
  existing_configuration_id UUID;
  existing_configuration_workspace_id UUID;
  existing_configuration_group_id UUID;
  existing_group_workspace_id UUID;
  existing_group_name TEXT;
  existing_group_status "GroupStatus";
  configuration_created BOOLEAN := false;
BEGIN
  SELECT w."id"
  INTO target_workspace_id
  FROM "workspaces" w
  WHERE w."id" = '74000000-0000-4000-8000-000000000001'::UUID
    AND w."type" = 'ORGANIZATION'
    AND w."name" = '運営団体ワタシワークス'
  LIMIT 1;

  -- A fresh development database has no operator workspace.  Keep that
  -- environment migratable, while making a partially provisioned production
  -- workspace fail loudly instead of pretending that HASSY is ready.
  IF target_workspace_id IS NULL THEN
    RAISE NOTICE 'HASSY service seed skipped: Watashi Works workspace is absent';
    RETURN;
  END IF;

  SELECT pa."user_id"
  INTO operator_user_id
  FROM "platform_admins" pa
  WHERE pa."role" = 'SUPER_ADMIN'
    AND pa."status" = 'ACTIVE'
  ORDER BY pa."granted_at", pa."user_id"
  LIMIT 1;

  IF operator_user_id IS NULL THEN
    RAISE EXCEPTION 'HASSY service seed requires an active SUPER_ADMIN';
  END IF;

  INSERT INTO "workspace_memberships" (
    "id", "workspace_id", "user_id", "role", "status", "created_at", "updated_at"
  ) VALUES (
    gen_random_uuid(),
    target_workspace_id,
    operator_user_id,
    'OWNER',
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("workspace_id", "user_id") DO UPDATE
  SET
    "role" = 'OWNER',
    "status" = 'ACTIVE',
    "updated_at" = CURRENT_TIMESTAMP;

  SELECT sc."id", sc."workspace_id", sc."group_id"
  INTO existing_configuration_id, existing_configuration_workspace_id, existing_configuration_group_id
  FROM "service_configurations" sc
  WHERE sc."slug" = 'hassy'
  LIMIT 1;

  SELECT g."id", g."workspace_id", g."status"
  INTO target_group_id, existing_group_workspace_id, existing_group_status
  FROM "groups" g
  WHERE g."workspace_id" = target_workspace_id
    AND g."name" = 'ハッシー'
  LIMIT 1;

  IF existing_configuration_id IS NOT NULL THEN
    IF existing_configuration_workspace_id <> target_workspace_id THEN
      RAISE EXCEPTION 'HASSY service configuration belongs to another workspace';
    END IF;
    IF target_group_id IS NOT NULL AND existing_configuration_group_id <> target_group_id THEN
      RAISE EXCEPTION 'HASSY group and service configuration do not match';
    END IF;
    target_group_id := existing_configuration_group_id;
    SELECT g."workspace_id", g."name", g."status"
    INTO existing_group_workspace_id, existing_group_name, existing_group_status
    FROM "groups" g
    WHERE g."id" = target_group_id;
    IF existing_group_workspace_id IS DISTINCT FROM target_workspace_id
      OR existing_group_name IS DISTINCT FROM 'ハッシー'
      OR existing_group_status IS DISTINCT FROM 'ACTIVE'
    THEN
      RAISE EXCEPTION 'HASSY service group is missing, renamed, or inactive';
    END IF;
    configuration_id := existing_configuration_id;
  ELSE
    IF target_group_id IS NULL THEN
      target_group_id := gen_random_uuid();
      INSERT INTO "groups" (
        "id", "workspace_id", "name", "status", "created_at", "updated_at"
      ) VALUES (
        target_group_id,
        target_workspace_id,
        'ハッシー',
        'ACTIVE',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      );
    ELSIF existing_group_workspace_id IS DISTINCT FROM target_workspace_id THEN
      RAISE EXCEPTION 'HASSY group belongs to another workspace';
    ELSIF existing_group_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'HASSY group exists but is not active';
    END IF;

    configuration_id := gen_random_uuid();
    configuration_created := true;
    INSERT INTO "service_configurations" (
      "id", "workspace_id", "group_id", "slug", "display_name", "description",
      "operator_name", "visibility", "powered_by_enabled", "trend_research_enabled",
      "point_issuance_stopped", "created_by_user_id", "updated_by_user_id",
      "created_at", "updated_at"
    ) VALUES (
      configuration_id,
      target_workspace_id,
      target_group_id,
      'hassy',
      'ハッシー',
      'SNS投稿を始め、無理なく続けるための投稿パートナーサービス',
      '運営団体ワタシワークス',
      'PUBLIC',
      true,
      true,
      false,
      operator_user_id,
      operator_user_id,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  END IF;

  IF target_group_id IS NULL THEN
    RAISE EXCEPTION 'HASSY service configuration has no group';
  END IF;

  IF NOT configuration_created THEN
    UPDATE "groups"
    SET "status" = 'ACTIVE', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = target_group_id AND "workspace_id" = target_workspace_id;

    UPDATE "service_configurations"
    SET
      "display_name" = 'ハッシー',
      "operator_name" = '運営団体ワタシワークス',
      "visibility" = 'PUBLIC',
      "powered_by_enabled" = true,
      "trend_research_enabled" = true,
      "point_issuance_stopped" = false,
      "updated_by_user_id" = operator_user_id,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = configuration_id
      AND "workspace_id" = target_workspace_id
      AND "group_id" = target_group_id;
  END IF;

  INSERT INTO "group_memberships" (
    "id", "workspace_id", "group_id", "user_id", "role", "service_role",
    "status", "consented_at", "created_at", "updated_at"
  ) VALUES (
    gen_random_uuid(),
    target_workspace_id,
    target_group_id,
    operator_user_id,
    'MANAGER',
    'SERVICE_OWNER',
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("group_id", "user_id") DO UPDATE
  SET
    "workspace_id" = EXCLUDED."workspace_id",
    "role" = 'MANAGER',
    "service_role" = 'SERVICE_OWNER',
    "status" = 'ACTIVE',
    "consented_at" = COALESCE("group_memberships"."consented_at", CURRENT_TIMESTAMP),
    "declined_at" = NULL,
    "revoked_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id" INTO membership_id;

  INSERT INTO "service_brands" (
    "id", "workspace_id", "group_id", "configuration_id", "primary_color",
    "secondary_color", "font_family", "created_at", "updated_at"
  ) VALUES (
    gen_random_uuid(),
    target_workspace_id,
    target_group_id,
    configuration_id,
    '#0B356A',
    '#FF3B30',
    'system-ui',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("group_id") DO UPDATE
  SET
    "workspace_id" = EXCLUDED."workspace_id",
    "configuration_id" = EXCLUDED."configuration_id",
    "updated_at" = CURRENT_TIMESTAMP;

  INSERT INTO "service_registration_policies" (
    "id", "workspace_id", "group_id", "configuration_id", "mode",
    "email_enabled", "line_enabled", "invite_code_enabled", "referral_enabled",
    "onboarding_config", "survey_config", "created_at", "updated_at"
  ) VALUES (
    gen_random_uuid(),
    target_workspace_id,
    target_group_id,
    configuration_id,
    'PUBLIC',
    true,
    true,
    false,
    false,
    jsonb_build_object(
      'templateKey', 'HASSY',
      'welcomeTitle', 'ハッシーを始める準備をします',
      'welcomeMessage', 'あなたの事業とSNSの目的に合う投稿を考えるために、少し教えてください。',
      'businessProfileEnabled', true,
      'businessProfileInputMode', 'MINIMAL',
      'profileQuestions', jsonb_build_object(
        'industry', true,
        'purpose', true,
        'activityName', false,
        'businessName', true,
        'region', true,
        'productService', true,
        'socialProfile', true,
        'notificationConsent', true
      ),
      'dailyIdeaDelivery', jsonb_build_object(
        'enabled', false,
        'cadence', 'DAILY',
        'defaultNotificationTime', '08:00',
        'lockCadence', false,
        'contentMode', 'READY_TO_USE',
        'mediaMode', 'TEXT_ONLY'
      )
    ),
    jsonb_build_object(
      'questions', jsonb_build_array(
        '業種を教えてください。',
        '事業名または会社名を教えてください。',
        'どんな商品・サービスを提供していますか？',
        'どんな人に届けたいですか？',
        'SNSで達成したい目的は何ですか？'
      )
    ),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("group_id") DO UPDATE
  SET
    "configuration_id" = EXCLUDED."configuration_id",
    "mode" = 'PUBLIC',
    "email_enabled" = true,
    "line_enabled" = true,
    "invite_code_enabled" = false,
    "referral_enabled" = false,
    "onboarding_config" = EXCLUDED."onboarding_config",
    "survey_config" = EXCLUDED."survey_config",
    "updated_at" = CURRENT_TIMESTAMP;

  INSERT INTO "service_commercial_settings" (
    "id", "workspace_id", "group_id", "configuration_id", "plan_name",
    "billing_mode", "status", "monthly_price_yen", "included_member_limit",
    "updated_by_user_id", "created_at", "updated_at"
  ) VALUES (
    gen_random_uuid(),
    target_workspace_id,
    target_group_id,
    configuration_id,
    'ハッシー無料テスト',
    'FREE',
    'ACTIVE',
    0,
    100,
    operator_user_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("group_id") DO UPDATE
  SET
    "configuration_id" = EXCLUDED."configuration_id",
    "plan_name" = EXCLUDED."plan_name",
    "billing_mode" = 'FREE',
    "status" = 'ACTIVE',
    "monthly_price_yen" = 0,
    "included_member_limit" = 100,
    "updated_by_user_id" = operator_user_id,
    "updated_at" = CURRENT_TIMESTAMP;

  INSERT INTO "group_feature_policies" (
    "id", "workspace_id", "group_id", "feature_key", "status", "config",
    "set_by_user_id", "created_at", "updated_at"
  ) VALUES
    (gen_random_uuid(), target_workspace_id, target_group_id, 'SOCIAL', 'ENABLED', '{}'::jsonb,
     operator_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), target_workspace_id, target_group_id, 'LINE.DAILY_NOTIFICATION', 'ENABLED', '{}'::jsonb,
     operator_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("group_id", "feature_key") DO UPDATE
  SET
    "status" = 'ENABLED',
    "set_by_user_id" = operator_user_id,
    "updated_at" = CURRENT_TIMESTAMP;

  INSERT INTO "group_member_feature_assignments" (
    "id", "workspace_id", "group_id", "group_membership_id", "feature_key",
    "status", "config", "assigned_by_user_id", "created_at", "updated_at"
  ) VALUES
    (gen_random_uuid(), target_workspace_id, target_group_id, membership_id, 'SOCIAL', 'ENABLED', '{}'::jsonb,
     operator_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), target_workspace_id, target_group_id, membership_id, 'LINE.DAILY_NOTIFICATION', 'ENABLED', '{}'::jsonb,
     operator_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("group_membership_id", "feature_key") DO UPDATE
  SET
    "status" = 'ENABLED',
    "assigned_by_user_id" = operator_user_id,
    "updated_at" = CURRENT_TIMESTAMP;

  IF configuration_created THEN
    INSERT INTO "service_configuration_audits" (
      "id", "workspace_id", "group_id", "configuration_id", "action",
      "after_data", "reason", "performed_by_user_id", "occurred_at"
    ) VALUES (
      gen_random_uuid(),
    target_workspace_id,
    target_group_id,
      configuration_id,
      'CREATED',
      jsonb_build_object(
        'slug', 'hassy',
        'displayName', 'ハッシー',
        'visibility', 'PUBLIC',
        'registrationMode', 'PUBLIC',
        'emailEnabled', true,
        'lineEnabled', true,
        'inviteCodeEnabled', false,
        'businessProfileInputMode', 'MINIMAL'
      ),
      'ハッシーの本番公開サービス設定を復元',
      operator_user_id,
      CURRENT_TIMESTAMP
    );
  END IF;
END $$;
