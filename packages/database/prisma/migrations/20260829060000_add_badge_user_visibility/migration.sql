CREATE TABLE "badge_award_visibilities" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "badge_award_id" UUID NOT NULL,
  "visibility" "BadgeVisibilityPolicy" NOT NULL DEFAULT 'PRIVATE',
  "shared_group_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "badge_award_visibilities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_award_visibility_scope_check" CHECK (("visibility" = 'PRIVATE' AND "shared_group_id" IS NULL) OR ("visibility" = 'GROUP' AND "shared_group_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "badge_award_visibilities_badge_award_id_key" ON "badge_award_visibilities"("badge_award_id");
CREATE UNIQUE INDEX "badge_award_visibilities_workspace_id_user_id_badge_award_id_key" ON "badge_award_visibilities"("workspace_id", "user_id", "badge_award_id");
CREATE UNIQUE INDEX "badge_awards_workspace_id_user_id_id_key" ON "badge_awards"("workspace_id", "user_id", "id");
CREATE INDEX "badge_award_visibilities_workspace_id_user_id_visibility_idx" ON "badge_award_visibilities"("workspace_id", "user_id", "visibility");
CREATE INDEX "badge_award_visibilities_workspace_id_shared_group_id_visibility_idx" ON "badge_award_visibilities"("workspace_id", "shared_group_id", "visibility");

ALTER TABLE "badge_award_visibilities" ADD CONSTRAINT "badge_award_visibilities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_award_visibilities" ADD CONSTRAINT "badge_award_visibilities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_award_visibilities" ADD CONSTRAINT "badge_award_visibilities_badge_award_scope_fkey" FOREIGN KEY ("workspace_id", "user_id", "badge_award_id") REFERENCES "badge_awards"("workspace_id", "user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "badge_award_visibilities" ADD CONSTRAINT "badge_award_visibilities_shared_group_scope_fkey" FOREIGN KEY ("workspace_id", "shared_group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
