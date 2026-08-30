CREATE TABLE "service_onboarding_responses" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "questions_snapshot" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "service_onboarding_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_onboarding_responses_group_membership_id_key"
ON "service_onboarding_responses"("group_membership_id");

CREATE UNIQUE INDEX "service_onboarding_responses_workspace_id_group_id_group_membership_id_user_id_key"
ON "service_onboarding_responses"("workspace_id", "group_id", "group_membership_id", "user_id");

CREATE INDEX "service_onboarding_responses_workspace_id_group_id_user_id_completed_at_idx"
ON "service_onboarding_responses"("workspace_id", "group_id", "user_id", "completed_at");

ALTER TABLE "service_onboarding_responses"
ADD CONSTRAINT "service_onboarding_responses_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_onboarding_responses"
ADD CONSTRAINT "service_onboarding_responses_workspace_id_group_id_fkey"
FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_onboarding_responses"
ADD CONSTRAINT "service_onboarding_responses_workspace_id_group_id_group_membership_id_user_id_fkey"
FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")
REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_onboarding_responses"
ADD CONSTRAINT "service_onboarding_responses_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
