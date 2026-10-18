CREATE TABLE "personal_learning_line_inbox" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "provider_event_id" VARCHAR(255) NOT NULL,
  "operation_id" UUID NOT NULL,
  "topic_id" UUID,
  "message_type" VARCHAR(16) NOT NULL,
  "text" TEXT,
  "line_message_id" VARCHAR(255),
  "image_mime_type" VARCHAR(32),
  "image_sha256" CHAR(64),
  "image_size_bytes" INTEGER,
  "image_bytes" BYTEA,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3),
  CONSTRAINT "personal_learning_line_inbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_learning_line_inbox_type_check" CHECK ("message_type" IN ('TEXT', 'IMAGE')),
  CONSTRAINT "personal_learning_line_inbox_payload_check" CHECK (
    ("message_type" = 'TEXT' AND "text" IS NOT NULL AND "line_message_id" IS NULL) OR
    ("message_type" = 'IMAGE' AND "text" IS NULL AND "line_message_id" IS NOT NULL)
  ),
  CONSTRAINT "personal_learning_line_inbox_enrollment_fk"
    FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id", "group_membership_id")
    REFERENCES "program_enrollments"("workspace_id", "group_id", "id", "group_membership_id") ON DELETE CASCADE,
  CONSTRAINT "personal_learning_line_inbox_membership_fk"
    FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
    REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE,
  CONSTRAINT "personal_learning_line_inbox_configuration_fk"
    FOREIGN KEY ("workspace_id", "group_id", "configuration_id")
    REFERENCES "group_line_channel_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE,
  CONSTRAINT "personal_learning_line_inbox_topic_fk"
    FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id", "topic_id")
    REFERENCES "personal_learning_topics"("workspace_id", "group_id", "program_enrollment_id", "id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "personal_learning_line_inbox_event_key"
  ON "personal_learning_line_inbox"("configuration_id", "provider_event_id");
CREATE INDEX "personal_learning_line_inbox_owner_created_idx"
  ON "personal_learning_line_inbox"("workspace_id", "group_id", "program_enrollment_id", "user_id", "created_at");
CREATE INDEX "personal_learning_line_inbox_status_created_idx"
  ON "personal_learning_line_inbox"("status", "created_at");

CREATE TABLE "personal_learning_line_pushes" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "provider_event_id" VARCHAR(255) NOT NULL,
  "purpose" VARCHAR(16) NOT NULL DEFAULT 'RESPONSE',
  "retry_key" UUID NOT NULL,
  "text" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "personal_learning_line_pushes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_learning_line_push_purpose_check" CHECK ("purpose" IN ('RESPONSE', 'FALLBACK')),
  CONSTRAINT "personal_learning_line_push_enrollment_fk"
    FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id", "group_membership_id")
    REFERENCES "program_enrollments"("workspace_id", "group_id", "id", "group_membership_id") ON DELETE CASCADE,
  CONSTRAINT "personal_learning_line_push_membership_fk"
    FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
    REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE,
  CONSTRAINT "personal_learning_line_push_configuration_fk"
    FOREIGN KEY ("workspace_id", "group_id", "configuration_id")
    REFERENCES "group_line_channel_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "personal_learning_line_push_retry_key_key"
  ON "personal_learning_line_pushes"("retry_key");
CREATE UNIQUE INDEX "personal_learning_line_push_inbound_purpose_key"
  ON "personal_learning_line_pushes"("configuration_id", "provider_event_id", "purpose");
CREATE INDEX "personal_learning_line_push_scope_created_idx"
  ON "personal_learning_line_pushes"("workspace_id", "group_id", "created_at");

CREATE TABLE "personal_learning_line_quota_notices" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "month_key" CHAR(7) NOT NULL,
  "threshold_percent" INTEGER NOT NULL,
  "observed_percent" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personal_learning_line_quota_notices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_learning_line_quota_configuration_fk"
    FOREIGN KEY ("workspace_id", "group_id", "configuration_id")
    REFERENCES "group_line_channel_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE,
  CONSTRAINT "personal_learning_line_quota_threshold_check" CHECK ("threshold_percent" BETWEEN 1 AND 100),
  CONSTRAINT "personal_learning_line_quota_observed_check" CHECK ("observed_percent" >= "threshold_percent")
);

CREATE UNIQUE INDEX "personal_learning_line_quota_notice_month_threshold_key"
  ON "personal_learning_line_quota_notices"("configuration_id", "month_key", "threshold_percent");
CREATE INDEX "personal_learning_line_quota_notice_scope_created_idx"
  ON "personal_learning_line_quota_notices"("workspace_id", "group_id", "created_at");

ALTER TABLE "personal_learning_line_inbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "personal_learning_line_pushes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "personal_learning_line_quota_notices" ENABLE ROW LEVEL SECURITY;
-- No public policies: rows remain accessible only to the trusted server database role.
