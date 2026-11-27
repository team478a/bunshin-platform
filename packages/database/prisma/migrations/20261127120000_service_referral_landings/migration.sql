ALTER TABLE "service_registration_policies"
ADD COLUMN "referral_landings" JSONB NOT NULL DEFAULT '{}';
