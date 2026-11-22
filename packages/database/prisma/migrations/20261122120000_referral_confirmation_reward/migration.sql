ALTER TYPE "ServiceReferralMilestone" ADD VALUE 'QUALIFICATION_CONFIRMED';
ALTER TABLE "fortune_readings" ADD COLUMN "free_first_viewed_at" TIMESTAMPTZ(6);

DO $$
DECLARE entry record;
BEGIN
  FOR entry IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    JOIN pg_attribute attr ON attr.attrelid = constraint_row.conrelid
      AND constraint_row.conkey = ARRAY[attr.attnum]
    WHERE constraint_row.conrelid = 'service_referral_qualification_policy_versions'::regclass
      AND constraint_row.contype = 'c'
      AND attr.attname IN ('profile_key', 'profile_revision', 'conditions')
  LOOP
    EXECUTE format('ALTER TABLE service_referral_qualification_policy_versions DROP CONSTRAINT %I', entry.conname);
  END LOOP;
END $$;

ALTER TABLE service_referral_qualification_policy_versions
 ADD CONSTRAINT referral_qualification_profile_conditions CHECK (
  jsonb_typeof(conditions) = 'object'
  AND conditions ? 'minimumActiveDays'
  AND jsonb_typeof(conditions->'minimumActiveDays') = 'number'
  AND (conditions->>'minimumActiveDays') ~ '^[0-9]+$'
  AND (conditions->>'minimumActiveDays')::numeric BETWEEN 0 AND 3660
  AND (
    (profile_key = 'SOCIAL_REFERRAL' AND profile_revision = 'service-referral-qualification-v1' AND (
   jsonb_typeof(conditions) = 'object'
   AND conditions ?& ARRAY['requireNewRegistration','requireOnboarding','requireFirstUserGeneration','minimumActiveDays']
   AND conditions - ARRAY['requireNewRegistration','requireOnboarding','requireFirstUserGeneration','minimumActiveDays'] = '{}'::jsonb
   AND jsonb_typeof(conditions->'requireNewRegistration')='boolean'
   AND jsonb_typeof(conditions->'requireOnboarding')='boolean'
   AND jsonb_typeof(conditions->'requireFirstUserGeneration')='boolean'
   AND jsonb_typeof(conditions->'minimumActiveDays')='number'
   AND (conditions->>'minimumActiveDays') ~ '^[0-9]+$'
   AND (conditions->>'minimumActiveDays')::numeric BETWEEN 0 AND 3660
    ))
    OR (profile_key = 'FORTUNE_REFERRAL' AND profile_revision = 'fortune-referral-qualification-v1' AND (
      conditions ?& ARRAY['requireFirstFreeReading','minimumActiveDays','minimumPaidPurchases']
      AND conditions - ARRAY['requireFirstFreeReading','minimumActiveDays','minimumPaidPurchases','registeredFrom','registeredBefore'] = '{}'::jsonb
      AND (NOT conditions ? 'registeredFrom' OR (
        (conditions->>'registeredFrom') ~ '^[0-9]+$'
        AND jsonb_typeof(conditions->'registeredFrom') = 'number'
        AND (conditions->>'registeredFrom')::numeric BETWEEN 1 AND 8640000000000000
      ))
      AND (NOT conditions ? 'registeredBefore' OR (
        (conditions->>'registeredBefore') ~ '^[0-9]+$'
        AND jsonb_typeof(conditions->'registeredBefore') = 'number'
        AND (conditions->>'registeredBefore')::numeric BETWEEN 1 AND 8640000000000000
      ))
      AND (NOT (conditions ?& ARRAY['registeredFrom','registeredBefore'])
        OR (conditions->>'registeredFrom')::numeric < (conditions->>'registeredBefore')::numeric)
      AND jsonb_typeof(conditions->'requireFirstFreeReading') = 'boolean'
      AND jsonb_typeof(conditions->'minimumPaidPurchases') = 'number'
      AND (conditions->>'minimumPaidPurchases') ~ '^[0-9]+$'
      AND (conditions->>'minimumPaidPurchases')::numeric BETWEEN 0 AND 1000
    ))
  )
 );

ALTER TABLE service_referral_qualification_audits
 ALTER COLUMN actor_user_id DROP NOT NULL,
 DROP CONSTRAINT service_referral_qualification_audits_kind_check,
 ADD CONSTRAINT referral_audit_actor_kind CHECK (
   (kind IN ('REVIEW', 'CONFIRM', 'REVOKE') AND actor_user_id IS NOT NULL)
   OR (kind = 'PAYMENT_REVOKE' AND actor_user_id IS NULL)
 );
