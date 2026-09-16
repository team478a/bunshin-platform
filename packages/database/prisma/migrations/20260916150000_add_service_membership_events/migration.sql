CREATE TYPE "ServiceNotificationChannel" AS ENUM ('LINE', 'EMAIL');

CREATE TYPE "ServiceMembershipEventType" AS ENUM (
  'REGISTRATION_COMPLETED',
  'FIRST_SERVICE_USE',
  'SERVICE_REVISITED',
  'NOTIFICATION_OPTED_IN',
  'NOTIFICATION_OPTED_OUT',
  'SERVICE_WITHDRAWN'
);

CREATE TABLE "service_notification_preferences" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "topic" VARCHAR(80) NOT NULL,
  "channel" "ServiceNotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "consented_at" TIMESTAMPTZ(6),
  "opted_out_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_membership_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "event_type" "ServiceMembershipEventType" NOT NULL,
  "topic" VARCHAR(80),
  "channel" "ServiceNotificationChannel",
  "idempotency_key" VARCHAR(200) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_membership_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "service_notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_membership_events" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "service_notification_preferences_workspace_id_group_id_group_membership_id_topic_channel_key"
ON "service_notification_preferences"("workspace_id", "group_id", "group_membership_id", "topic", "channel");
CREATE INDEX "service_notification_preferences_workspace_id_group_id_topic_channel_enabled_idx"
ON "service_notification_preferences"("workspace_id", "group_id", "topic", "channel", "enabled");
CREATE INDEX "service_notification_preferences_user_id_enabled_idx"
ON "service_notification_preferences"("user_id", "enabled");

CREATE UNIQUE INDEX "service_membership_events_idempotency_key_key"
ON "service_membership_events"("idempotency_key");
CREATE INDEX "service_membership_events_workspace_id_group_id_event_type_occurred_at_idx"
ON "service_membership_events"("workspace_id", "group_id", "event_type", "occurred_at");
CREATE INDEX "service_membership_events_group_membership_id_occurred_at_idx"
ON "service_membership_events"("group_membership_id", "occurred_at");
CREATE INDEX "service_membership_events_user_id_occurred_at_idx"
ON "service_membership_events"("user_id", "occurred_at");

ALTER TABLE "service_notification_preferences"
ADD CONSTRAINT "service_notification_preferences_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_notification_preferences"
ADD CONSTRAINT "service_notification_preferences_workspace_id_group_id_fkey"
FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_notification_preferences"
ADD CONSTRAINT "service_notification_preferences_membership_fkey"
FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_notification_preferences"
ADD CONSTRAINT "service_notification_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_membership_events"
ADD CONSTRAINT "service_membership_events_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_membership_events"
ADD CONSTRAINT "service_membership_events_workspace_id_group_id_fkey"
FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_membership_events"
ADD CONSTRAINT "service_membership_events_membership_fkey"
FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_membership_events"
ADD CONSTRAINT "service_membership_events_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
