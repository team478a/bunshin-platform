CREATE TABLE "group_line_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL, "user_id" UUID NOT NULL, "configuration_id" UUID NOT NULL,
  "provider_user_id" VARCHAR(255) NOT NULL, "status" "LineConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "friendship_status" "LineFriendshipStatus" NOT NULL DEFAULT 'UNKNOWN', "notification_consent_at" TIMESTAMPTZ(6),
  "followed_at" TIMESTAMPTZ(6), "unfollowed_at" TIMESTAMPTZ(6), "last_webhook_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "group_line_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_line_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL, "provider_event_id" VARCHAR(255) NOT NULL,
  "type" "LineWebhookEventType" NOT NULL, "outcome" "LineWebhookEventOutcome" NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL, "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_line_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_line_connections_configuration_user_key" ON "group_line_connections"("configuration_id", "user_id");
CREATE UNIQUE INDEX "group_line_connections_configuration_provider_key" ON "group_line_connections"("configuration_id", "provider_user_id");
CREATE UNIQUE INDEX "group_line_channel_configurations_workspace_group_id_key" ON "group_line_channel_configurations"("workspace_id", "group_id", "id");
CREATE INDEX "group_line_connections_scope_user_status_idx" ON "group_line_connections"("workspace_id", "group_id", "user_id", "status");
CREATE INDEX "group_line_connections_provider_status_idx" ON "group_line_connections"("configuration_id", "provider_user_id", "status", "friendship_status");
CREATE UNIQUE INDEX "group_line_webhook_events_configuration_event_key" ON "group_line_webhook_events"("configuration_id", "provider_event_id");
CREATE INDEX "group_line_webhook_events_scope_processed_idx" ON "group_line_webhook_events"("workspace_id", "group_id", "processed_at");
CREATE INDEX "group_line_webhook_events_configuration_processed_idx" ON "group_line_webhook_events"("configuration_id", "processed_at");

ALTER TABLE "group_line_connections"
  ADD CONSTRAINT "group_line_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_connections_workspace_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_connections_membership_user_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_connections_scope_configuration_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "group_line_channel_configurations"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group_line_webhook_events"
  ADD CONSTRAINT "group_line_webhook_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_webhook_events_workspace_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_webhook_events_scope_configuration_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "group_line_channel_configurations"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
