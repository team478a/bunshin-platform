BEGIN;
SET LOCAL lock_timeout = '5000ms';
SET LOCAL statement_timeout = '60000ms';
SET LOCAL idle_in_transaction_session_timeout = '60000ms';

-- Corrections preserve the reviewed source rows and append one successor. Runtime
-- operations serialize per member/group and select only rows without a successor.
DROP INDEX "oem_registration_periods_group_membership_id_starts_at_key";
DROP INDEX "oem_registration_one_open";
DROP INDEX "oem_offering_periods_workspace_id_group_id_starts_at_key";
DROP INDEX "oem_offering_one_open";

ALTER TABLE "oem_registration_periods"
ADD COLUMN "supersedes_id" UUID;

ALTER TABLE "oem_offering_periods"
ADD COLUMN "supersedes_id" UUID;

CREATE UNIQUE INDEX "oem_registration_periods_supersedes_id_key"
ON "oem_registration_periods"("supersedes_id");

CREATE INDEX "oem_registration_periods_group_membership_id_starts_at_idx"
ON "oem_registration_periods"("group_membership_id", "starts_at");

CREATE UNIQUE INDEX "oem_offering_periods_supersedes_id_key"
ON "oem_offering_periods"("supersedes_id");

CREATE INDEX "oem_offering_periods_workspace_id_group_id_starts_at_idx"
ON "oem_offering_periods"("workspace_id", "group_id", "starts_at");

ALTER TABLE "oem_registration_periods"
ADD CONSTRAINT "oem_registration_supersedes_fk"
FOREIGN KEY ("supersedes_id") REFERENCES "oem_registration_periods"("id")
ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "oem_offering_periods"
ADD CONSTRAINT "oem_offering_supersedes_fk"
FOREIGN KEY ("supersedes_id") REFERENCES "oem_offering_periods"("id")
ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "oem_registration_periods"
ADD CONSTRAINT "oem_registration_no_self_supersession"
CHECK ("supersedes_id" IS NULL OR "supersedes_id" <> "id");

ALTER TABLE "oem_offering_periods"
ADD CONSTRAINT "oem_offering_no_self_supersession"
CHECK ("supersedes_id" IS NULL OR "supersedes_id" <> "id");
COMMIT;
