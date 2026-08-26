CREATE TABLE "group_feature_usage_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "feature_key" VARCHAR(120) NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "operation_key" VARCHAR(200) NOT NULL,
  "local_date" VARCHAR(10) NOT NULL,
  "local_month" VARCHAR(7) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_feature_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_feature_usage_events_member_feature_operation_key"
  ON "group_feature_usage_events"("group_membership_id", "feature_key", "operation_key");
CREATE INDEX "group_feature_usage_events_workspace_group_feature_date_idx"
  ON "group_feature_usage_events"("workspace_id", "group_id", "feature_key", "local_date");
CREATE INDEX "group_feature_usage_events_member_feature_month_idx"
  ON "group_feature_usage_events"("group_membership_id", "feature_key", "local_month");

ALTER TABLE "group_feature_usage_events"
  ADD CONSTRAINT "group_feature_usage_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_feature_usage_events"
  ADD CONSTRAINT "group_feature_usage_events_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_feature_usage_events"
  ADD CONSTRAINT "group_feature_usage_events_group_membership_id_fkey"
  FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_feature_usage_events"
  ADD CONSTRAINT "group_feature_usage_events_feature_key_fkey"
  FOREIGN KEY ("feature_key") REFERENCES "feature_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_feature_usage_events"
  ADD CONSTRAINT "group_feature_usage_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
