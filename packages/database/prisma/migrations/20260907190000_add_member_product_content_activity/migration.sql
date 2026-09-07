CREATE TYPE "MemberProductContentPlatform" AS ENUM ('INSTAGRAM', 'X', 'THREADS');
CREATE TYPE "MemberProductContentEventType" AS ENUM ('COPIED', 'POSTED');

ALTER TABLE "member_product_profiles"
ADD CONSTRAINT "member_product_profiles_scope_id_key"
UNIQUE ("workspace_id", "group_id", "group_membership_id", "user_id", "id");

CREATE TABLE "member_product_content_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "external_tracking_link_id" UUID NOT NULL,
  "product_pack_id" UUID,
  "platform" "MemberProductContentPlatform" NOT NULL,
  "candidate_count" INTEGER NOT NULL,
  "operation_key" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "member_product_content_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "member_product_content_runs_candidate_count_check"
    CHECK ("candidate_count" BETWEEN 1 AND 10),
  CONSTRAINT "member_product_content_runs_profile_fkey"
    FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id", "profile_id")
    REFERENCES "member_product_profiles"("workspace_id", "group_id", "group_membership_id", "user_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "member_product_content_runs_bunshin_fkey"
    FOREIGN KEY ("workspace_id", "bunshin_id")
    REFERENCES "bunshins"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "member_product_content_runs_external_tracking_link_fkey"
    FOREIGN KEY ("external_tracking_link_id") REFERENCES "external_tracking_links"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "member_product_content_runs_product_pack_fkey"
    FOREIGN KEY ("product_pack_id") REFERENCES "product_packs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "member_product_content_runs_membership_operation_key"
ON "member_product_content_runs"("group_membership_id", "operation_key");
CREATE INDEX "member_product_content_runs_scope_profile_created_idx"
ON "member_product_content_runs"("workspace_id", "group_id", "group_membership_id", "profile_id", "created_at");
CREATE INDEX "member_product_content_runs_scope_product_created_idx"
ON "member_product_content_runs"("workspace_id", "group_id", "product_pack_id", "created_at");
CREATE INDEX "member_product_content_runs_link_created_idx"
ON "member_product_content_runs"("external_tracking_link_id", "created_at");

CREATE TABLE "member_product_content_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "content_run_id" UUID NOT NULL,
  "type" "MemberProductContentEventType" NOT NULL,
  "candidate_index" INTEGER NOT NULL,
  "operation_key" VARCHAR(160) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "member_product_content_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "member_product_content_events_candidate_index_check" CHECK ("candidate_index" >= 0),
  CONSTRAINT "member_product_content_events_run_fkey"
    FOREIGN KEY ("content_run_id") REFERENCES "member_product_content_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "member_product_content_events_run_type_candidate_key"
ON "member_product_content_events"("content_run_id", "type", "candidate_index");
CREATE UNIQUE INDEX "member_product_content_events_run_operation_key"
ON "member_product_content_events"("content_run_id", "operation_key");
CREATE INDEX "member_product_content_events_run_occurred_idx"
ON "member_product_content_events"("content_run_id", "occurred_at");
