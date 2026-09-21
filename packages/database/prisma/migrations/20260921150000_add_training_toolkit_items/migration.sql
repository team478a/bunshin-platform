CREATE TABLE "training_toolkit_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "program_enrollment_id" UUID NOT NULL,
    "mission_assignment_id" UUID NOT NULL,
    "training_mission_answer_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mission_definition_key" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "content_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "training_toolkit_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_toolkit_items_training_mission_answer_id_key"
ON "training_toolkit_items"("training_mission_answer_id");

CREATE UNIQUE INDEX "training_toolkit_items_workspace_id_group_id_id_key"
ON "training_toolkit_items"("workspace_id", "group_id", "id");

CREATE INDEX "training_toolkit_items_workspace_id_group_id_program_enrollment_id_created_at_idx"
ON "training_toolkit_items"("workspace_id", "group_id", "program_enrollment_id", "created_at");

CREATE INDEX "training_toolkit_items_workspace_id_group_id_user_id_created_at_idx"
ON "training_toolkit_items"("workspace_id", "group_id", "user_id", "created_at");

ALTER TABLE "training_toolkit_items" ENABLE ROW LEVEL SECURITY;
