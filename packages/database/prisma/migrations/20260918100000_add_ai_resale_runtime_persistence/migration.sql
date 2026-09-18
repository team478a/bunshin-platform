CREATE TYPE "ProgramActionMode" AS ENUM ('WORK', 'WAIT');
CREATE TYPE "ResaleItemStatus" AS ENUM ('FOUND', 'PHOTOGRAPHED', 'LISTED', 'SOLD', 'SHIPPED', 'ARCHIVED');
CREATE TYPE "ResaleReactionState" AS ENUM ('UNKNOWN', 'NO_REACTION', 'REACTION', 'SOLD');

ALTER TABLE "program_enrollments"
  ADD CONSTRAINT "program_enrollments_scope_membership_key"
  UNIQUE ("workspace_id", "group_id", "id", "group_membership_id");

ALTER TABLE "program_mission_assignments"
  ADD COLUMN "action_mode" "ProgramActionMode" NOT NULL DEFAULT 'WORK',
  ADD COLUMN "reason_code" VARCHAR(80),
  ADD COLUMN "reevaluate_at" TIMESTAMPTZ(3);

ALTER TABLE "program_mission_assignments"
  ADD CONSTRAINT "program_mission_assignments_wait_check" CHECK (
    "action_mode" = 'WORK' OR
    ("action_mode" = 'WAIT' AND "reason_code" IS NOT NULL AND "reevaluate_at" IS NOT NULL)
  );

CREATE INDEX "program_mission_assignments_reevaluation_idx"
  ON "program_mission_assignments"("workspace_id", "group_id", "action_mode", "reevaluate_at", "status");

ALTER TABLE "program_progress_snapshots"
  ADD COLUMN "next_evaluation_at" TIMESTAMPTZ(3);

CREATE INDEX "program_progress_snapshots_next_evaluation_idx"
  ON "program_progress_snapshots"("workspace_id", "group_id", "next_evaluation_at");

CREATE TABLE "resale_items" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "status" "ResaleItemStatus" NOT NULL DEFAULT 'FOUND',
  "reaction_state" "ResaleReactionState" NOT NULL DEFAULT 'UNKNOWN',
  "found_at" TIMESTAMPTZ(3) NOT NULL,
  "listed_at" TIMESTAMPTZ(3),
  "reaction_observed_at" TIMESTAMPTZ(3),
  "last_improvement_type" VARCHAR(80),
  "last_improved_at" TIMESTAMPTZ(3),
  "sold_at" TIMESTAMPTZ(3),
  "sold_price_yen" INTEGER,
  "shipped_at" TIMESTAMPTZ(3),
  "reevaluate_at" TIMESTAMPTZ(3),
  "archived_at" TIMESTAMPTZ(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "resale_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resale_items_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "resale_items_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "resale_items_price_check" CHECK ("sold_price_yen" IS NULL OR "sold_price_yen" >= 0),
  CONSTRAINT "resale_items_improvement_pair_check" CHECK (
    ("last_improvement_type" IS NULL AND "last_improved_at" IS NULL) OR
    ("last_improvement_type" IS NOT NULL AND "last_improved_at" IS NOT NULL)
  ),
  CONSTRAINT "resale_items_archive_check" CHECK (
    ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL) OR
    ("status" <> 'ARCHIVED' AND "archived_at" IS NULL)
  ),
  CONSTRAINT "resale_items_lifecycle_check" CHECK (
    ("status" IN ('FOUND', 'PHOTOGRAPHED') AND "listed_at" IS NULL AND "sold_at" IS NULL AND "shipped_at" IS NULL) OR
    ("status" = 'LISTED' AND "listed_at" IS NOT NULL AND "sold_at" IS NULL AND "shipped_at" IS NULL) OR
    ("status" = 'SOLD' AND "listed_at" IS NOT NULL AND "sold_at" IS NOT NULL AND "shipped_at" IS NULL) OR
    ("status" = 'SHIPPED' AND "listed_at" IS NOT NULL AND "sold_at" IS NOT NULL AND "shipped_at" IS NOT NULL) OR
    "status" = 'ARCHIVED'
  ),
  CONSTRAINT "resale_items_reaction_check" CHECK (
    "reaction_state" <> 'SOLD' OR "status" IN ('SOLD', 'SHIPPED', 'ARCHIVED')
  ),
  CONSTRAINT "resale_items_reevaluation_check" CHECK (
    "reevaluate_at" IS NULL OR "status" = 'LISTED'
  ),
  CONSTRAINT "resale_items_time_order_check" CHECK (
    ("listed_at" IS NULL OR "listed_at" >= "found_at") AND
    ("reaction_observed_at" IS NULL OR "listed_at" IS NOT NULL AND "reaction_observed_at" >= "listed_at") AND
    ("last_improved_at" IS NULL OR "listed_at" IS NOT NULL AND "last_improved_at" >= "listed_at") AND
    ("sold_at" IS NULL OR "listed_at" IS NOT NULL AND "sold_at" >= "listed_at") AND
    ("shipped_at" IS NULL OR "sold_at" IS NOT NULL AND "shipped_at" >= "sold_at") AND
    ("archived_at" IS NULL OR "archived_at" >= "found_at")
  )
);

CREATE UNIQUE INDEX "resale_items_scope_key"
  ON "resale_items"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "resale_items_creation_idempotency_key"
  ON "resale_items"("workspace_id", "group_id", "program_enrollment_id", "idempotency_key");
CREATE INDEX "resale_items_enrollment_status_idx"
  ON "resale_items"("workspace_id", "group_id", "program_enrollment_id", "status", "updated_at");
CREATE INDEX "resale_items_owner_status_idx"
  ON "resale_items"("workspace_id", "group_id", "owner_user_id", "status", "updated_at");
CREATE INDEX "resale_items_reevaluation_idx"
  ON "resale_items"("workspace_id", "group_id", "status", "reevaluate_at");

ALTER TABLE "resale_items"
  ADD CONSTRAINT "resale_items_enrollment_membership_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id", "group_membership_id")
  REFERENCES "program_enrollments"("workspace_id", "group_id", "id", "group_membership_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "resale_items"
  ADD CONSTRAINT "resale_items_membership_owner_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "owner_user_id")
  REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "resale_items" ENABLE ROW LEVEL SECURITY;
