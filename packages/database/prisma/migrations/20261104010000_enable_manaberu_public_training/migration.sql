-- Enable service-configured training admission for Manaberu and backfill only
-- its current ACTIVE participants. AI usage consent remains learner-controlled.
DO $$
DECLARE
  target RECORD;
  target_program RECORD;
  target_offering RECORD;
  operator_user_id UUID;
  participant_count INTEGER;
  enrollment_ids JSONB;
BEGIN
  SELECT
    sc."id" AS configuration_id,
    sc."workspace_id",
    sc."group_id",
    sc."visibility"::TEXT AS visibility,
    srp."id" AS registration_policy_id,
    srp."mode"::TEXT AS registration_mode,
    srp."onboarding_config"
  INTO target
  FROM "service_configurations" sc
  JOIN "service_registration_policies" srp
    ON srp."workspace_id" = sc."workspace_id"
   AND srp."group_id" = sc."group_id"
   AND srp."configuration_id" = sc."id"
  WHERE sc."slug" = 'manaberu-style';

  IF NOT FOUND THEN
    RAISE NOTICE 'Manaberu public training configuration skipped: service is absent';
    RETURN;
  END IF;
  IF target.configuration_id <> '1b74ed83-977a-4a54-9750-ab381c5d8367'::UUID
    OR target.workspace_id <> '74000000-0000-4000-8000-000000000001'::UUID
    OR target.group_id <> 'ae9e96ca-16f3-4210-af4f-44d18bdaebe3'::UUID
    OR target.visibility <> 'PUBLIC'
    OR target.registration_mode <> 'PUBLIC'
  THEN
    RAISE EXCEPTION 'Manaberu public training service boundary is not canonical';
  END IF;

  SELECT sp."id", sp."settings"
  INTO target_program
  FROM "service_programs" sp
  WHERE sp."workspace_id" = target.workspace_id
    AND sp."group_id" = target.group_id
    AND sp."display_name" = 'マナベルスタイル AI研修30日'
    AND sp."status" = 'ACTIVE'
    AND sp."settings"->>'moduleKey' = 'AI_TRAINING_V1';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manaberu public training Program is unavailable';
  END IF;
  IF (
    SELECT COUNT(*)
    FROM "service_programs" sp
    WHERE sp."workspace_id" = target.workspace_id
      AND sp."group_id" = target.group_id
      AND sp."display_name" = 'マナベルスタイル AI研修30日'
      AND sp."status" = 'ACTIVE'
      AND sp."settings"->>'moduleKey' = 'AI_TRAINING_V1'
  ) <> 1 THEN
    RAISE EXCEPTION 'Manaberu public training Program is not unique';
  END IF;

  SELECT po.*
  INTO target_offering
  FROM "program_offerings" po
  WHERE po."workspace_id" = target.workspace_id
    AND po."group_id" = target.group_id
    AND po."service_program_id" = target_program.id
    AND po."status" = 'ACTIVE'
    AND po."is_free" = true
    AND po."price_reference" IS NULL
    AND (po."starts_at" IS NULL OR po."starts_at" <= CURRENT_TIMESTAMP)
    AND (po."ends_at" IS NULL OR po."ends_at" > CURRENT_TIMESTAMP);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manaberu public training Offering is unavailable';
  END IF;
  IF (
    SELECT COUNT(*)
    FROM "program_offerings" po
    WHERE po."workspace_id" = target.workspace_id
      AND po."group_id" = target.group_id
      AND po."service_program_id" = target_program.id
      AND po."status" = 'ACTIVE'
      AND po."is_free" = true
      AND po."price_reference" IS NULL
      AND (po."starts_at" IS NULL OR po."starts_at" <= CURRENT_TIMESTAMP)
      AND (po."ends_at" IS NULL OR po."ends_at" > CURRENT_TIMESTAMP)
  ) <> 1
    OR target_offering."terms_snapshot"->>'participation' <> 'INVITATION_ONLY'
    OR NOT COALESCE(target_offering."terms_snapshot"->'supportModes', '[]'::JSONB) ? 'GUIDED'
  THEN
    RAISE EXCEPTION 'Manaberu public training Offering is not canonical';
  END IF;

  SELECT gm."user_id"
  INTO operator_user_id
  FROM "group_memberships" gm
  WHERE gm."workspace_id" = target.workspace_id
    AND gm."group_id" = target.group_id
    AND gm."service_role" = 'SERVICE_OWNER'
    AND gm."status" = 'ACTIVE'
  ORDER BY gm."created_at", gm."id"
  LIMIT 1;
  IF operator_user_id IS NULL THEN
    RAISE EXCEPTION 'Manaberu public training requires an active SERVICE_OWNER';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO participant_count
  FROM "group_memberships" gm
  WHERE gm."workspace_id" = target.workspace_id
    AND gm."group_id" = target.group_id
    AND gm."role" = 'PARTICIPANT'
    AND gm."service_role" = 'PARTICIPANT'
    AND gm."status" = 'ACTIVE';
  IF participant_count > 100 THEN
    RAISE EXCEPTION 'Manaberu public training participant cap would be exceeded';
  END IF;

  -- A repeated execution is allowed only after the complete canonical result.
  IF target.onboarding_config->'trainingAutoAdmission' = jsonb_build_object(
      'version', 'SERVICE_TRAINING_AUTO_ADMISSION_V1',
      'enabled', true,
      'serviceProgramId', target_program.id::TEXT,
      'programOfferingId', target_offering.id::TEXT
    )
    AND target_program.settings->'personalLearningPilot'->>'enabled' = 'true'
  THEN
    IF target_program.settings->'personalLearningPilot'->'participantControl' <>
        jsonb_build_object(
          'version', 'PILOT_PARTICIPANT_CAP_V1',
          'revision', 1,
          'externalParticipantCap', 0,
          'internalParticipantCap', 100,
          'currentWave', 0,
          'currentWaveCap', 0
        )
      OR target_program.settings->'trainingOperations'->>'notificationsEnabled' <> 'false'
      OR target_program.settings->'trainingOperations'->>'postponedReminderEnabled' <> 'false'
      OR jsonb_array_length(
        COALESCE(target_program.settings->'personalLearningPilot'->'enrollmentIds', '[]'::JSONB)
      ) <> participant_count
      OR (
      SELECT COUNT(*)
      FROM "program_enrollments" pe
      WHERE pe."workspace_id" = target.workspace_id
        AND pe."group_id" = target.group_id
        AND pe."service_program_id" = target_program.id
        AND pe."program_offering_id" = target_offering.id
        AND pe."status" = 'ACTIVE'
      ) <> participant_count
      OR (
        SELECT COUNT(*)
        FROM "personal_learning_pilot_seats" pls
        WHERE pls."workspace_id" = target.workspace_id
          AND pls."group_id" = target.group_id
          AND pls."service_program_id" = target_program.id
          AND pls."kind" = 'INTERNAL'
          AND pls."cohort" = 'INTERNAL'
          AND pls."revoked_at" IS NULL
      ) <> participant_count
      OR EXISTS (
        SELECT 1
        FROM "group_memberships" gm
        LEFT JOIN "program_enrollments" pe
          ON pe."workspace_id" = gm."workspace_id"
         AND pe."group_id" = gm."group_id"
         AND pe."group_membership_id" = gm."id"
         AND pe."service_program_id" = target_program.id
         AND pe."program_offering_id" = target_offering.id
         AND pe."status" = 'ACTIVE'
        LEFT JOIN "personal_learning_pilot_seats" pls
          ON pls."workspace_id" = gm."workspace_id"
         AND pls."group_id" = gm."group_id"
         AND pls."service_program_id" = target_program.id
         AND pls."program_enrollment_id" = pe."id"
         AND pls."kind" = 'INTERNAL'
         AND pls."cohort" = 'INTERNAL'
         AND pls."revoked_at" IS NULL
        WHERE gm."workspace_id" = target.workspace_id
          AND gm."group_id" = target.group_id
          AND gm."role" = 'PARTICIPANT'
          AND gm."service_role" = 'PARTICIPANT'
          AND gm."status" = 'ACTIVE'
          AND (pe."id" IS NULL OR pls."id" IS NULL)
      )
      OR EXISTS (
        SELECT 1
        FROM "program_enrollments" pe
        WHERE pe."workspace_id" = target.workspace_id
          AND pe."group_id" = target.group_id
          AND pe."service_program_id" = target_program.id
          AND NOT (
            target_program.settings->'personalLearningPilot'->'enrollmentIds'
            ? pe."id"::TEXT
          )
      )
    THEN
      RAISE EXCEPTION 'Manaberu public training is partially configured';
    END IF;
    RAISE NOTICE 'Manaberu public training configuration is already canonical';
    RETURN;
  END IF;

  IF target.onboarding_config ? 'trainingAutoAdmission'
    OR target_program.settings ? 'personalLearningPilot'
    OR EXISTS (
      SELECT 1 FROM "program_enrollments" pe
      WHERE pe."workspace_id" = target.workspace_id
        AND pe."group_id" = target.group_id
        AND pe."service_program_id" = target_program.id
    )
    OR EXISTS (
      SELECT 1 FROM "personal_learning_pilot_seats" pls
      WHERE pls."workspace_id" = target.workspace_id
        AND pls."group_id" = target.group_id
        AND pls."service_program_id" = target_program.id
    )
  THEN
    RAISE EXCEPTION 'Manaberu public training has unexpected existing state';
  END IF;

  INSERT INTO "program_enrollments" (
    "id", "workspace_id", "group_id", "group_membership_id",
    "service_program_id", "program_offering_id", "status", "support_mode",
    "goal_snapshot", "offering_snapshot", "invited_by_user_id", "starts_at",
    "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(), target.workspace_id, target.group_id, gm."id",
    target_program.id, target_offering.id, 'ACTIVE', 'GUIDED',
    jsonb_build_object('goal', ''),
    jsonb_build_object(
      'version', target_offering."version",
      'isFree', target_offering."is_free",
      'seller', target_offering."seller",
      'apiCostOwner', target_offering."api_cost_owner",
      'supportOwner', target_offering."support_owner",
      'contentOwner', target_offering."content_owner",
      'characterOwner', target_offering."character_owner",
      'terms', target_offering."terms_snapshot"
    ),
    operator_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "group_memberships" gm
  WHERE gm."workspace_id" = target.workspace_id
    AND gm."group_id" = target.group_id
    AND gm."role" = 'PARTICIPANT'
    AND gm."service_role" = 'PARTICIPANT'
    AND gm."status" = 'ACTIVE';

  INSERT INTO "personal_learning_pilot_seats" (
    "id", "workspace_id", "group_id", "service_program_id", "participant_hash",
    "program_enrollment_id", "kind", "cohort", "seat_number", "admitted_at"
  )
  SELECT
    gen_random_uuid(), target.workspace_id, target.group_id, target_program.id,
    encode(sha256(convert_to(
      'PILOT_SEAT_V1:' || target_program.id::TEXT || ':' || gm."user_id"::TEXT,
      'UTF8'
    )), 'hex'),
    pe."id", 'INTERNAL', 'INTERNAL',
    row_number() OVER (ORDER BY gm."created_at", gm."id")::INTEGER,
    CURRENT_TIMESTAMP
  FROM "group_memberships" gm
  JOIN "program_enrollments" pe
    ON pe."workspace_id" = gm."workspace_id"
   AND pe."group_id" = gm."group_id"
   AND pe."group_membership_id" = gm."id"
   AND pe."service_program_id" = target_program.id
  WHERE gm."workspace_id" = target.workspace_id
    AND gm."group_id" = target.group_id
    AND gm."role" = 'PARTICIPANT'
    AND gm."service_role" = 'PARTICIPANT'
    AND gm."status" = 'ACTIVE';

  SELECT COALESCE(jsonb_agg(pe."id"::TEXT ORDER BY pe."created_at", pe."id"), '[]'::JSONB)
  INTO enrollment_ids
  FROM "program_enrollments" pe
  WHERE pe."workspace_id" = target.workspace_id
    AND pe."group_id" = target.group_id
    AND pe."service_program_id" = target_program.id
    AND pe."program_offering_id" = target_offering.id
    AND pe."status" = 'ACTIVE';

  UPDATE "service_programs"
  SET
    "settings" = jsonb_set(
      jsonb_set(
        "settings",
        '{trainingOperations}',
        COALESCE("settings"->'trainingOperations', '{}'::JSONB) || jsonb_build_object(
          'notificationsEnabled', false,
          'postponedReminderEnabled', false
        ),
        true
      ),
      '{personalLearningPilot}',
      jsonb_build_object(
        'enabled', true,
        'enrollmentIds', enrollment_ids,
        'participantControl', jsonb_build_object(
          'version', 'PILOT_PARTICIPANT_CAP_V1',
          'revision', 1,
          'externalParticipantCap', 0,
          'internalParticipantCap', 100,
          'currentWave', 0,
          'currentWaveCap', 0
        )
      ),
      true
    ),
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = target_program.id
    AND "workspace_id" = target.workspace_id
    AND "group_id" = target.group_id;

  UPDATE "service_registration_policies"
  SET
    "onboarding_config" = "onboarding_config" || jsonb_build_object(
      'trainingAutoAdmission', jsonb_build_object(
        'version', 'SERVICE_TRAINING_AUTO_ADMISSION_V1',
        'enabled', true,
        'serviceProgramId', target_program.id::TEXT,
        'programOfferingId', target_offering.id::TEXT
      )
    ),
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = target.registration_policy_id
    AND "workspace_id" = target.workspace_id
    AND "group_id" = target.group_id;

  INSERT INTO "program_audit_logs" (
    "id", "workspace_id", "group_id", "resource_type", "resource_id", "action",
    "before_data", "after_data", "performed_by_user_id", "performed_at"
  ) VALUES (
    gen_random_uuid(), target.workspace_id, target.group_id, 'SERVICE_PROGRAM',
    target_program.id, 'PUBLIC_REGISTRATION_TRAINING_ENABLED',
    jsonb_build_object('autoAdmissionEnabled', false),
    jsonb_build_object(
      'autoAdmissionEnabled', true,
      'participantCount', participant_count,
      'internalParticipantCap', 100,
      'aiConsentCreated', false
    ),
    operator_user_id, CURRENT_TIMESTAMP
  );

  INSERT INTO "service_configuration_audits" (
    "id", "workspace_id", "group_id", "configuration_id", "action",
    "before_data", "after_data", "reason", "performed_by_user_id", "occurred_at"
  ) VALUES (
    gen_random_uuid(), target.workspace_id, target.group_id, target.configuration_id, 'UPDATED',
    jsonb_build_object('trainingAutoAdmissionEnabled', false),
    jsonb_build_object('trainingAutoAdmissionEnabled', true),
    '一般公開登録後の研修参加をサービス設定に基づいて自動準備する',
    operator_user_id, CURRENT_TIMESTAMP
  );
END $$;
