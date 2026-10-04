ALTER TABLE "weekly_plans"
ADD COLUMN "social_profile_id" UUID,
ADD COLUMN "strategy_id" UUID,
ADD COLUMN "strategy_goal" "SocialAccountStrategyGoal";

CREATE UNIQUE INDEX "social_account_strategies_workspace_id_bunshin_id_id_key"
ON "social_account_strategies"("workspace_id", "bunshin_id", "id");

CREATE INDEX "weekly_plans_workspace_id_bunshin_id_strategy_id_idx"
ON "weekly_plans"("workspace_id", "bunshin_id", "strategy_id");

ALTER TABLE "weekly_plans"
ADD CONSTRAINT "weekly_plans_workspace_id_bunshin_id_strategy_id_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id", "strategy_id")
REFERENCES "social_account_strategies"("workspace_id", "bunshin_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
