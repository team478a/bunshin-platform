CREATE TABLE "service_point_reward_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "reward_type" "PointRewardType" NOT NULL,
  "status" "PointCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "point_cost" INTEGER NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_point_reward_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_point_reward_settings_values_check" CHECK (
    "point_cost" > 0 AND "status" IN ('ACTIVE', 'SUSPENDED')
  )
);

ALTER TABLE "service_point_reward_settings" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "service_point_reward_settings_workspace_id_group_id_reward_type_key"
  ON "service_point_reward_settings"("workspace_id", "group_id", "reward_type");
CREATE INDEX "service_point_reward_settings_group_id_status_idx"
  ON "service_point_reward_settings"("group_id", "status");

ALTER TABLE "service_point_reward_settings"
  ADD CONSTRAINT "service_point_reward_settings_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_point_reward_settings"
  ADD CONSTRAINT "service_point_reward_settings_workspace_id_group_id_fkey"
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_point_reward_settings"
  ADD CONSTRAINT "service_point_reward_settings_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
