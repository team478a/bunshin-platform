CREATE TYPE "ServiceReferralCodeStatus" AS ENUM ('ACTIVE', 'DISABLED', 'REPLACED');
CREATE TYPE "ServiceReferralStatus" AS ENUM ('CLICKED', 'REGISTERED', 'ONBOARDING_COMPLETED', 'FIRST_CONTENT_VIEWED', 'FIRST_POST_REPORTED', 'REJECTED');
CREATE TYPE "ServiceReferralRewardRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'SUSPENDED');
CREATE TYPE "ServiceReferralMilestone" AS ENUM ('ONBOARDING_COMPLETED', 'FIRST_POST_REPORTED');
CREATE TYPE "ServiceReferralRewardRecipient" AS ENUM ('REFERRER', 'REFERRED');
CREATE TYPE "ServiceReferralRewardStatus" AS ENUM ('PENDING', 'GRANTED', 'REVOKED');
CREATE TYPE "ServiceCreditTransactionType" AS ENUM ('GRANT', 'CONSUME', 'REFUND', 'EXPIRE', 'ADJUST');
CREATE TYPE "ServiceCreditSourceType" AS ENUM ('REFERRAL', 'CAMPAIGN', 'PURCHASE', 'ADMIN', 'SYSTEM');

CREATE TABLE "service_referral_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "status" "ServiceReferralCodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "disabled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_referral_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_referral_codes_membership_key" UNIQUE ("workspace_id", "group_id", "group_membership_id"),
  CONSTRAINT "service_referral_codes_membership_scope_user_key" UNIQUE ("workspace_id", "group_id", "group_membership_id", "user_id"),
  CONSTRAINT "service_referral_codes_code_key" UNIQUE ("workspace_id", "group_id", "code"),
  CONSTRAINT "service_referral_codes_scope_id_key" UNIQUE ("workspace_id", "group_id", "id"),
  CONSTRAINT "service_referral_codes_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_referral_codes_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "service_referral_codes_workspace_id_group_id_status_idx" ON "service_referral_codes"("workspace_id", "group_id", "status");

CREATE TABLE "service_referral_clicks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "referral_code_id" UUID NOT NULL,
  "source" VARCHAR(80),
  "campaign_key" VARCHAR(120),
  "content_key" VARCHAR(120),
  "landing_variant" VARCHAR(120),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "clicked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_referral_clicks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_referral_clicks_scope_id_key" UNIQUE ("workspace_id", "group_id", "id"),
  CONSTRAINT "service_referral_clicks_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_referral_clicks_code_fkey" FOREIGN KEY ("workspace_id", "group_id", "referral_code_id") REFERENCES "service_referral_codes"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "service_referral_clicks_code_clicked_at_idx" ON "service_referral_clicks"("workspace_id", "group_id", "referral_code_id", "clicked_at");
CREATE INDEX "service_referral_clicks_expires_at_idx" ON "service_referral_clicks"("expires_at");

CREATE TABLE "service_referrals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "referral_code_id" UUID NOT NULL,
  "referral_click_id" UUID,
  "referred_membership_id" UUID NOT NULL,
  "referred_user_id" UUID NOT NULL,
  "status" "ServiceReferralStatus" NOT NULL DEFAULT 'REGISTERED',
  "registered_at" TIMESTAMPTZ(6),
  "onboarding_completed_at" TIMESTAMPTZ(6),
  "first_content_viewed_at" TIMESTAMPTZ(6),
  "first_post_reported_at" TIMESTAMPTZ(6),
  "rejected_at" TIMESTAMPTZ(6),
  "rejection_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_referrals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_referrals_click_key" UNIQUE ("referral_click_id"),
  CONSTRAINT "service_referrals_click_scope_key" UNIQUE ("workspace_id", "group_id", "referral_click_id"),
  CONSTRAINT "service_referrals_referred_membership_key" UNIQUE ("workspace_id", "group_id", "referred_membership_id"),
  CONSTRAINT "service_referrals_scope_id_key" UNIQUE ("workspace_id", "group_id", "id"),
  CONSTRAINT "service_referrals_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_referrals_code_fkey" FOREIGN KEY ("workspace_id", "group_id", "referral_code_id") REFERENCES "service_referral_codes"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_referrals_click_fkey" FOREIGN KEY ("workspace_id", "group_id", "referral_click_id") REFERENCES "service_referral_clicks"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_referrals_referred_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "referred_membership_id", "referred_user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "service_referrals_status_created_at_idx" ON "service_referrals"("workspace_id", "group_id", "status", "created_at");
CREATE INDEX "service_referrals_code_status_idx" ON "service_referrals"("referral_code_id", "status");

CREATE TABLE "service_referral_reward_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "rule_key" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ServiceReferralRewardRuleStatus" NOT NULL DEFAULT 'DRAFT',
  "milestone" "ServiceReferralMilestone" NOT NULL,
  "recipient" "ServiceReferralRewardRecipient" NOT NULL,
  "credit_amount" INTEGER NOT NULL,
  "expires_after_days" INTEGER,
  "monthly_grant_limit" INTEGER,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "superseded_at" TIMESTAMPTZ(6),
  CONSTRAINT "service_referral_reward_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_referral_reward_rules_version_key" UNIQUE ("workspace_id", "group_id", "rule_key", "version"),
  CONSTRAINT "service_referral_reward_rules_scope_id_key" UNIQUE ("workspace_id", "group_id", "id"),
  CONSTRAINT "service_referral_reward_rules_credit_amount_check" CHECK ("credit_amount" > 0),
  CONSTRAINT "service_referral_reward_rules_expiry_check" CHECK ("expires_after_days" IS NULL OR "expires_after_days" BETWEEN 1 AND 3650),
  CONSTRAINT "service_referral_reward_rules_monthly_limit_check" CHECK ("monthly_grant_limit" IS NULL OR "monthly_grant_limit" > 0),
  CONSTRAINT "service_referral_reward_rules_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_referral_reward_rules_actor_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "service_referral_reward_rules_status_milestone_idx" ON "service_referral_reward_rules"("workspace_id", "group_id", "status", "milestone");

CREATE TABLE "service_credit_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "available_credits" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_credit_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_credit_accounts_membership_key" UNIQUE ("workspace_id", "group_id", "group_membership_id"),
  CONSTRAINT "service_credit_accounts_membership_scope_user_key" UNIQUE ("workspace_id", "group_id", "group_membership_id", "user_id"),
  CONSTRAINT "service_credit_accounts_scope_id_user_key" UNIQUE ("workspace_id", "group_id", "id", "user_id"),
  CONSTRAINT "service_credit_accounts_available_check" CHECK ("available_credits" >= 0),
  CONSTRAINT "service_credit_accounts_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_credit_accounts_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "service_credit_accounts_workspace_group_user_idx" ON "service_credit_accounts"("workspace_id", "group_id", "user_id");

CREATE TABLE "service_credit_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "ServiceCreditTransactionType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "source_type" "ServiceCreditSourceType" NOT NULL,
  "source_id" VARCHAR(200),
  "idempotency_key" VARCHAR(200) NOT NULL,
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_credit_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_credit_ledger_idempotency_key" UNIQUE ("account_id", "idempotency_key"),
  CONSTRAINT "service_credit_ledger_balance_check" CHECK ("balance_after" >= 0),
  CONSTRAINT "service_credit_ledger_amount_check" CHECK (("type" IN ('GRANT', 'REFUND', 'ADJUST') AND "amount" <> 0) OR ("type" IN ('CONSUME', 'EXPIRE') AND "amount" < 0)),
  CONSTRAINT "service_credit_ledger_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_credit_ledger_account_fkey" FOREIGN KEY ("workspace_id", "group_id", "account_id", "user_id") REFERENCES "service_credit_accounts"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "service_credit_ledger_user_created_at_idx" ON "service_credit_ledger"("workspace_id", "group_id", "user_id", "created_at");
CREATE INDEX "service_credit_ledger_expires_at_idx" ON "service_credit_ledger"("expires_at");

CREATE TABLE "service_referral_rewards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "referral_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "beneficiary_account_id" UUID NOT NULL,
  "beneficiary_user_id" UUID NOT NULL,
  "beneficiary_membership_id" UUID NOT NULL,
  "status" "ServiceReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
  "credit_amount" INTEGER NOT NULL,
  "granted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revocation_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_referral_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_referral_rewards_idempotency_key" UNIQUE ("referral_id", "rule_id", "beneficiary_membership_id"),
  CONSTRAINT "service_referral_rewards_credit_amount_check" CHECK ("credit_amount" > 0),
  CONSTRAINT "service_referral_rewards_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_referral_rewards_referral_fkey" FOREIGN KEY ("workspace_id", "group_id", "referral_id") REFERENCES "service_referrals"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_referral_rewards_rule_fkey" FOREIGN KEY ("workspace_id", "group_id", "rule_id") REFERENCES "service_referral_reward_rules"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_referral_rewards_account_fkey" FOREIGN KEY ("workspace_id", "group_id", "beneficiary_account_id", "beneficiary_user_id") REFERENCES "service_credit_accounts"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_referral_rewards_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "beneficiary_membership_id", "beneficiary_user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "service_referral_rewards_status_created_at_idx" ON "service_referral_rewards"("workspace_id", "group_id", "status", "created_at");
