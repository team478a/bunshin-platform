CREATE TYPE "LineConnectionStatus" AS ENUM ('ACTIVE', 'DISCONNECTED');
CREATE TYPE "LineFriendshipStatus" AS ENUM ('UNKNOWN', 'FOLLOWING', 'UNFOLLOWED');
CREATE TYPE "LineWebhookEventType" AS ENUM ('FOLLOW', 'UNFOLLOW', 'OTHER');
CREATE TYPE "LineWebhookEventOutcome" AS ENUM (
  'APPLIED',
  'DUPLICATE',
  'IDENTITY_NOT_FOUND',
  'CONNECTION_NOT_FOUND',
  'IGNORED'
);

CREATE TABLE "line_connections" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider_user_id" VARCHAR(255) NOT NULL,
  "status" "LineConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "friendship_status" "LineFriendshipStatus" NOT NULL DEFAULT 'UNKNOWN',
  "notification_consent_at" TIMESTAMPTZ(6),
  "followed_at" TIMESTAMPTZ(6),
  "unfollowed_at" TIMESTAMPTZ(6),
  "last_webhook_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "line_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "line_webhook_events" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "provider_event_id" VARCHAR(255) NOT NULL,
  "type" "LineWebhookEventType" NOT NULL,
  "outcome" "LineWebhookEventOutcome" NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workspace_id" UUID,
  CONSTRAINT "line_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "line_connections_environment_workspace_id_user_id_key"
ON "line_connections"("environment", "workspace_id", "user_id");
CREATE INDEX "line_connections_environment_provider_user_id_status_friend_idx"
ON "line_connections"("environment", "provider_user_id", "status", "friendship_status");
CREATE INDEX "line_connections_workspace_id_user_id_status_idx"
ON "line_connections"("workspace_id", "user_id", "status");
CREATE UNIQUE INDEX "line_webhook_events_environment_provider_event_id_key"
ON "line_webhook_events"("environment", "provider_event_id");
CREATE INDEX "line_webhook_events_environment_processed_at_idx"
ON "line_webhook_events"("environment", "processed_at");
CREATE INDEX "line_webhook_events_workspace_id_processed_at_idx"
ON "line_webhook_events"("workspace_id", "processed_at");

ALTER TABLE "line_connections"
ADD CONSTRAINT "line_connections_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "line_connections"
ADD CONSTRAINT "line_connections_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "line_webhook_events"
ADD CONSTRAINT "line_webhook_events_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
