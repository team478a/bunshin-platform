-- Restore the identity of the official Watashi Works service only.
-- This intentionally does not overwrite its registration/onboarding policy.
DO $$
DECLARE
  target RECORD;
  brand RECORD;
  actor_user_id UUID;
  before_data JSONB;
  after_data JSONB;
  needs_update BOOLEAN := false;
BEGIN
  SELECT
    sc."id",
    sc."workspace_id",
    sc."group_id",
    sc."slug",
    sc."display_name",
    sc."description",
    sc."operator_name",
    sc."contact_email",
    sc."updated_by_user_id",
    g."name" AS group_name
  INTO target
  FROM "service_configurations" sc
  LEFT JOIN "groups" g
    ON g."workspace_id" = sc."workspace_id"
   AND g."id" = sc."group_id"
  WHERE sc."slug" = 'watashi-works-official'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'official service identity repair skipped: service configuration is absent';
    RETURN;
  END IF;

  IF target.id <> '74000000-0000-4000-8000-000000000005'::UUID
    OR target.workspace_id <> '74000000-0000-4000-8000-000000000001'::UUID
    OR target.group_id <> '74000000-0000-4000-8000-000000000003'::UUID
  THEN
    RAISE EXCEPTION 'official service identity repair target is mismatched';
  END IF;

  IF target.group_name <> '企業向け' THEN
    RAISE EXCEPTION 'official service identity repair target group is unexpected: %', target.group_name;
  END IF;

  SELECT
    sb."id",
    sb."logo_url",
    sb."icon_url",
    sb."favicon_url",
    sb."primary_color",
    sb."secondary_color",
    sb."font_family"
  INTO brand
  FROM "service_brands" sb
  WHERE sb."workspace_id" = target.workspace_id
    AND sb."group_id" = target.group_id
    AND sb."configuration_id" = target.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'official service identity repair brand row is missing';
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
    RAISE EXCEPTION 'official service identity repair requires an active operator';
  END IF;

  needs_update := target.display_name IS DISTINCT FROM 'ワタシワークス公式'
    OR target.description IS DISTINCT FROM '企業・店舗・個人事業主へ、毎日そのまま使えるSNS投稿文を届ける無料サービス'
    OR target.operator_name IS DISTINCT FROM '運営団体ワタシワークス'
    OR target.contact_email IS DISTINCT FROM 'support@watashi-works.com'
    OR brand.logo_url IS DISTINCT FROM 'https://www.watashi-works.com/watashiworks-logo.jpg'
    OR brand.icon_url IS DISTINCT FROM 'https://www.watashi-works.com/watashiworks-icon.jpg'
    OR brand.favicon_url IS DISTINCT FROM 'https://www.watashi-works.com/watashiworks-icon.jpg'
    OR brand.primary_color IS DISTINCT FROM '#0B356A'
    OR brand.secondary_color IS DISTINCT FROM '#FF3B30'
    OR brand.font_family IS DISTINCT FROM 'system-ui';

  IF NOT needs_update THEN
    RAISE NOTICE 'official service identity is already canonical';
    RETURN;
  END IF;

  before_data := jsonb_build_object(
    'slug', target.slug,
    'displayName', target.display_name,
    'description', target.description,
    'operatorName', target.operator_name,
    'contactEmail', target.contact_email,
    'logoUrl', brand.logo_url,
    'iconUrl', brand.icon_url,
    'faviconUrl', brand.favicon_url,
    'primaryColor', brand.primary_color,
    'secondaryColor', brand.secondary_color,
    'fontFamily', brand.font_family
  );

  UPDATE "service_configurations"
  SET
    "display_name" = 'ワタシワークス公式',
    "description" = '企業・店舗・個人事業主へ、毎日そのまま使えるSNS投稿文を届ける無料サービス',
    "operator_name" = '運営団体ワタシワークス',
    "contact_email" = 'support@watashi-works.com',
    "updated_by_user_id" = actor_user_id,
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = target.id;

  UPDATE "service_brands"
  SET
    "logo_url" = 'https://www.watashi-works.com/watashiworks-logo.jpg',
    "icon_url" = 'https://www.watashi-works.com/watashiworks-icon.jpg',
    "favicon_url" = 'https://www.watashi-works.com/watashiworks-icon.jpg',
    "primary_color" = '#0B356A',
    "secondary_color" = '#FF3B30',
    "font_family" = 'system-ui',
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = brand.id;

  after_data := jsonb_build_object(
    'slug', 'watashi-works-official',
    'displayName', 'ワタシワークス公式',
    'description', '企業・店舗・個人事業主へ、毎日そのまま使えるSNS投稿文を届ける無料サービス',
    'operatorName', '運営団体ワタシワークス',
    'contactEmail', 'support@watashi-works.com',
    'logoUrl', 'https://www.watashi-works.com/watashiworks-logo.jpg',
    'iconUrl', 'https://www.watashi-works.com/watashiworks-icon.jpg',
    'faviconUrl', 'https://www.watashi-works.com/watashiworks-icon.jpg',
    'primaryColor', '#0B356A',
    'secondaryColor', '#FF3B30',
    'fontFamily', 'system-ui'
  );

  INSERT INTO "service_configuration_audits" (
    "id", "workspace_id", "group_id", "configuration_id", "action",
    "before_data", "after_data", "reason", "performed_by_user_id", "occurred_at"
  ) VALUES (
    gen_random_uuid(),
    target.workspace_id,
    target.group_id,
    target.id,
    'UPDATED',
    before_data,
    after_data,
    'ワタシワークス公式のサービス identity を復元し、ハッシーとの表示・ブランド混在を解消',
    actor_user_id,
    CURRENT_TIMESTAMP
  );
END $$;
