DO $$
DECLARE
  target_configuration RECORD;
BEGIN
  SELECT
    sc."id",
    sc."workspace_id",
    sc."group_id",
    sc."updated_by_user_id",
    sc."visibility"::TEXT AS previous_visibility,
    srp."mode"::TEXT AS previous_registration_mode,
    srp."line_enabled" AS previous_line_enabled,
    srp."email_enabled" AS previous_email_enabled,
    srp."invite_code_enabled" AS previous_invite_code_enabled
  INTO target_configuration
  FROM "service_configurations" sc
  INNER JOIN "service_registration_policies" srp
    ON srp."workspace_id" = sc."workspace_id"
    AND srp."group_id" = sc."group_id"
    AND srp."configuration_id" = sc."id"
  WHERE sc."slug" = 'watashi-works-official';

  IF NOT FOUND THEN
    RAISE NOTICE 'Watashi Works official publication skipped: service configuration not found';
    RETURN;
  END IF;

  IF target_configuration.previous_visibility <> 'PUBLIC'
    OR target_configuration.previous_registration_mode <> 'PUBLIC'
    OR target_configuration.previous_line_enabled IS NOT TRUE
    OR target_configuration.previous_email_enabled IS NOT FALSE
    OR target_configuration.previous_invite_code_enabled IS NOT FALSE
  THEN
    UPDATE "service_configurations"
    SET
      "visibility" = 'PUBLIC',
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = target_configuration."id";

    UPDATE "service_registration_policies"
    SET
      "mode" = 'PUBLIC',
      "line_enabled" = true,
      "email_enabled" = false,
      "invite_code_enabled" = false,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "workspace_id" = target_configuration."workspace_id"
      AND "group_id" = target_configuration."group_id"
      AND "configuration_id" = target_configuration."id";

    INSERT INTO "service_configuration_audits" (
      "id",
      "workspace_id",
      "group_id",
      "configuration_id",
      "action",
      "before_data",
      "after_data",
      "reason",
      "performed_by_user_id",
      "occurred_at"
    ) VALUES (
      gen_random_uuid(),
      target_configuration."workspace_id",
      target_configuration."group_id",
      target_configuration."id",
      'UPDATED',
      jsonb_build_object(
        'visibility', target_configuration.previous_visibility,
        'registrationMode', target_configuration.previous_registration_mode,
        'lineEnabled', target_configuration.previous_line_enabled,
        'emailEnabled', target_configuration.previous_email_enabled,
        'inviteCodeEnabled', target_configuration.previous_invite_code_enabled
      ),
      jsonb_build_object(
        'visibility', 'PUBLIC',
        'registrationMode', 'PUBLIC',
        'lineEnabled', true,
        'emailEnabled', false,
        'inviteCodeEnabled', false
      ),
      'ワタシワークス公式をLINE登録導線で一般公開',
      target_configuration."updated_by_user_id",
      CURRENT_TIMESTAMP
    );
  END IF;
END $$;
