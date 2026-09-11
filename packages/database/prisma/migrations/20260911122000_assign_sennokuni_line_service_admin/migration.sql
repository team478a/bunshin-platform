-- The production pilot is operated from the single LINE account that also uses
-- the participant experience. Promote that one existing account without
-- touching the separate platform administrator account.
DO $$
DECLARE
  target_count INTEGER;
  target_membership RECORD;
BEGIN
  SELECT COUNT(*)
  INTO target_count
  FROM "group_memberships" gm
  WHERE gm."group_id" = '452a3368-2a7d-4a17-92ae-822afffa8dcf'::UUID
    AND gm."status" = 'ACTIVE'
    AND gm."role" = 'PARTICIPANT'
    AND gm."service_role" = 'PARTICIPANT'
    AND EXISTS (
      SELECT 1
      FROM "auth_identities" ai
      WHERE ai."user_id" = gm."user_id"
        AND ai."provider" = 'LINE'
    );

  IF target_count = 1 THEN
    SELECT gm.*
    INTO target_membership
    FROM "group_memberships" gm
    WHERE gm."group_id" = '452a3368-2a7d-4a17-92ae-822afffa8dcf'::UUID
      AND gm."status" = 'ACTIVE'
      AND gm."role" = 'PARTICIPANT'
      AND gm."service_role" = 'PARTICIPANT'
      AND EXISTS (
        SELECT 1
        FROM "auth_identities" ai
        WHERE ai."user_id" = gm."user_id"
          AND ai."provider" = 'LINE'
      );

    UPDATE "group_memberships"
    SET
      "role" = 'MANAGER',
      "service_role" = 'SERVICE_ADMIN',
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = target_membership."id";

    INSERT INTO "group_membership_audit_logs" (
      "id",
      "workspace_id",
      "group_id",
      "group_membership_id",
      "action",
      "before_data",
      "after_data",
      "reason",
      "performed_by_user_id",
      "occurred_at"
    ) VALUES (
      gen_random_uuid(),
      target_membership."workspace_id",
      target_membership."group_id",
      target_membership."id",
      'ROLE_CHANGED',
      jsonb_build_object(
        'role', target_membership."role",
        'serviceRole', target_membership."service_role"
      ),
      jsonb_build_object(
        'role', 'MANAGER',
        'serviceRole', 'SERVICE_ADMIN'
      ),
      '1アカウント運用のためLINE利用者へ運営管理権限を設定（2026-09-11）',
      target_membership."user_id",
      CURRENT_TIMESTAMP
    );
  END IF;
END $$;
