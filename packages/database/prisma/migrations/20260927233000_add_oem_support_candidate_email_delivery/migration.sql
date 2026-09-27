ALTER TYPE "ServiceMessageTemplatePurpose" ADD VALUE 'OEM_SUPPORT_CANDIDATE';

CREATE TABLE "social_activity_oem_support_candidate_email_deliveries" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "email_configuration_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL,
  "recipient_email" VARCHAR(320) NOT NULL,
  "recipient_name" VARCHAR(120),
  "from_name" VARCHAR(120) NOT NULL,
  "from_email" VARCHAR(320) NOT NULL,
  "reply_to_email" VARCHAR(320),
  "subject" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "handling_mode" "ServiceSupportAlertMode" NOT NULL,
  "status" "ServiceRegistrationEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider_message_id" VARCHAR(200),
  "last_error_category" VARCHAR(80),
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_activity_oem_support_candidate_email_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_activity_oem_candidate_email_recipient_key" UNIQUE ("candidate_id", "recipient_user_id"),
  CONSTRAINT "social_activity_oem_candidate_email_candidate_fkey" FOREIGN KEY ("candidate_id") REFERENCES "social_activity_oem_support_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "social_activity_oem_candidate_email_config_fkey" FOREIGN KEY ("email_configuration_id") REFERENCES "service_registration_email_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "social_activity_oem_candidate_email_status_idx" ON "social_activity_oem_support_candidate_email_deliveries"("status", "next_attempt_at");
CREATE INDEX "social_activity_oem_candidate_email_scope_idx" ON "social_activity_oem_support_candidate_email_deliveries"("workspace_id", "group_id", "created_at");
ALTER TABLE "social_activity_oem_support_candidate_email_deliveries" ENABLE ROW LEVEL SECURITY;
