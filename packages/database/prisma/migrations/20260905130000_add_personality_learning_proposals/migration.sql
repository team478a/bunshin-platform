CREATE TYPE "PersonalityLearningProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

CREATE TABLE "personality_learning_proposals" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "bunshin_id" UUID NOT NULL,
    "status" "PersonalityLearningProposalStatus" NOT NULL DEFAULT 'PENDING',
    "proposed_content" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "evidence_ids" JSONB NOT NULL,
    "based_on_version_id" UUID NOT NULL,
    "applied_version_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    CONSTRAINT "personality_learning_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personality_learning_proposals_applied_version_id_key"
ON "personality_learning_proposals"("applied_version_id");

CREATE UNIQUE INDEX "personality_learning_proposals_one_pending_per_bunshin"
ON "personality_learning_proposals"("workspace_id", "bunshin_id") WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "personality_learning_proposals_workspace_id_bunshin_id_id_key"
ON "personality_learning_proposals"("workspace_id", "bunshin_id", "id");

CREATE INDEX "personality_learning_proposals_workspace_id_bunshin_id_status_created_at_idx"
ON "personality_learning_proposals"("workspace_id", "bunshin_id", "status", "created_at");

CREATE INDEX "personality_learning_proposals_created_by_user_id_created_at_idx"
ON "personality_learning_proposals"("created_by_user_id", "created_at");

ALTER TABLE "personality_learning_proposals" ADD CONSTRAINT "personality_learning_proposals_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personality_learning_proposals" ADD CONSTRAINT "personality_learning_proposals_workspace_id_bunshin_id_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personality_learning_proposals" ADD CONSTRAINT "personality_learning_proposals_based_on_version_id_fkey"
FOREIGN KEY ("based_on_version_id") REFERENCES "bunshin_personality_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personality_learning_proposals" ADD CONSTRAINT "personality_learning_proposals_applied_version_id_fkey"
FOREIGN KEY ("applied_version_id") REFERENCES "bunshin_personality_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personality_learning_proposals" ADD CONSTRAINT "personality_learning_proposals_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
