CREATE TABLE "service_referral_qualification_policy_versions" (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, group_id uuid NOT NULL,
 policy_key varchar(100) NOT NULL DEFAULT 'social-referral', version integer NOT NULL CHECK (version > 0),
 authority varchar(20) NOT NULL CHECK (authority IN ('HEADQUARTERS','SERVICE')),
 status varchar(20) NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED')),
 profile_key varchar(40) NOT NULL CHECK (profile_key = 'SOCIAL_REFERRAL'),
 profile_revision varchar(100) NOT NULL CHECK (profile_revision = 'service-referral-qualification-v1'),
 conditions jsonb NOT NULL CHECK (
   jsonb_typeof(conditions) = 'object'
   AND conditions ?& ARRAY['requireNewRegistration','requireOnboarding','requireFirstUserGeneration','minimumActiveDays']
   AND conditions - ARRAY['requireNewRegistration','requireOnboarding','requireFirstUserGeneration','minimumActiveDays'] = '{}'::jsonb
   AND jsonb_typeof(conditions->'requireNewRegistration')='boolean'
   AND jsonb_typeof(conditions->'requireOnboarding')='boolean'
   AND jsonb_typeof(conditions->'requireFirstUserGeneration')='boolean'
   AND jsonb_typeof(conditions->'minimumActiveDays')='number'
   AND (conditions->>'minimumActiveDays') ~ '^[0-9]+$'
   AND (conditions->>'minimumActiveDays')::numeric BETWEEN 0 AND 3660
 ),
 timezone varchar(64) NOT NULL, reason varchar(1000) NOT NULL CHECK (length(trim(reason)) > 0),
 created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz(6) NOT NULL DEFAULT now(),
 FOREIGN KEY (workspace_id,group_id) REFERENCES groups(workspace_id,id) ON DELETE RESTRICT,
 CONSTRAINT referral_qualification_policy_scope UNIQUE (workspace_id,group_id,id),
 CONSTRAINT referral_qualification_policy_version UNIQUE (workspace_id,group_id,policy_key,version)
);
ALTER TABLE service_referrals
 ADD COLUMN qualification_state varchar(20) NOT NULL DEFAULT 'UNASSESSED',
 ADD COLUMN qualification_review varchar(20) NOT NULL DEFAULT 'UNKNOWN',
 ADD COLUMN qualification_revision integer NOT NULL DEFAULT 0,
 ADD COLUMN confirmed_policy_version_id uuid,
 ADD COLUMN confirmed_at timestamptz(6),
 ADD COLUMN revoked_at timestamptz(6),
 ADD CONSTRAINT service_referral_qualification_policy_fk FOREIGN KEY(workspace_id,group_id,confirmed_policy_version_id)
 REFERENCES service_referral_qualification_policy_versions(workspace_id,group_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT service_referral_qualification_check CHECK (
 qualification_revision >= 0 AND qualification_review IN ('UNKNOWN','REQUIRED','CLEAR') AND (
 (qualification_state='UNASSESSED' AND confirmed_policy_version_id IS NULL AND confirmed_at IS NULL AND revoked_at IS NULL)
 OR (qualification_state IN ('CONFIRMED','REVOKED') AND qualification_review='CLEAR' AND confirmed_policy_version_id IS NOT NULL AND confirmed_at IS NOT NULL
 AND ((qualification_state='CONFIRMED' AND revoked_at IS NULL) OR (qualification_state='REVOKED' AND revoked_at IS NOT NULL AND revoked_at >= confirmed_at)))
 ));
CREATE TABLE "service_referral_qualification_audits" (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, group_id uuid NOT NULL,
 referral_id uuid NOT NULL, command_id uuid NOT NULL, actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind varchar(20) NOT NULL CHECK (kind IN ('REVIEW','CONFIRM','REVOKE')),
 reason varchar(1000) NOT NULL CHECK(length(trim(reason)) > 0), fingerprint varchar(64) NOT NULL,
 before_revision integer NOT NULL CHECK(before_revision >= 0), result jsonb NOT NULL,
 occurred_at timestamptz(6) NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,group_id,referral_id) REFERENCES service_referrals(workspace_id,group_id,id) ON DELETE RESTRICT,
 CONSTRAINT referral_qualification_command UNIQUE(workspace_id,group_id,command_id)
);
CREATE INDEX service_referral_qualification_audit_lookup ON service_referral_qualification_audits(workspace_id,group_id,referral_id,occurred_at);
CREATE INDEX service_referral_qualification_count ON service_referrals(workspace_id,group_id,qualification_state,referral_code_id);
CREATE FUNCTION referral_qualification_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'referral qualification history is immutable';
END $$;
CREATE TRIGGER referral_policy_immutable BEFORE UPDATE ON service_referral_qualification_policy_versions
 FOR EACH ROW EXECUTE FUNCTION referral_qualification_immutable();
CREATE TRIGGER referral_audit_immutable BEFORE UPDATE ON service_referral_qualification_audits
 FOR EACH ROW EXECUTE FUNCTION referral_qualification_immutable();
CREATE FUNCTION referral_confirmation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.qualification_state IN ('CONFIRMED','REVOKED') AND (
 NEW.confirmed_policy_version_id IS DISTINCT FROM OLD.confirmed_policy_version_id OR
 NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR
 NEW.qualification_review IS DISTINCT FROM OLD.qualification_review OR
 NEW.qualification_state='UNASSESSED' OR
 (OLD.qualification_state='REVOKED' AND (NEW.qualification_state <> 'REVOKED' OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at))
 ) THEN RAISE EXCEPTION 'referral confirmation cannot be rewritten'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER referral_confirmation_immutable BEFORE UPDATE ON service_referrals
 FOR EACH ROW EXECUTE FUNCTION referral_confirmation_guard();

-- Server-side authorization is required. Public/anonymous database roles get no policies.
ALTER TABLE "service_referral_qualification_policy_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_referral_qualification_audits" ENABLE ROW LEVEL SECURITY;
