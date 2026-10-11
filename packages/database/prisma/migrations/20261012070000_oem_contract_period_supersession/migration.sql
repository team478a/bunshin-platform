-- Keep the original reviewed period immutable. A correction is a new row pointing at
-- the immediately previous version; current projections select rows without a successor.
DROP INDEX "oem_contract_periods_workspace_id_starts_at_key";

ALTER TABLE "oem_contract_periods"
ADD COLUMN "supersedes_id" UUID;

CREATE UNIQUE INDEX "oem_contract_periods_supersedes_id_key"
ON "oem_contract_periods"("supersedes_id");

CREATE INDEX "oem_contract_periods_workspace_id_starts_at_idx"
ON "oem_contract_periods"("workspace_id", "starts_at");

ALTER TABLE "oem_contract_periods"
ADD CONSTRAINT "oem_contract_supersedes_fk"
FOREIGN KEY ("supersedes_id") REFERENCES "oem_contract_periods"("id")
ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "oem_contract_periods"
ADD CONSTRAINT "oem_contract_no_self_supersession"
CHECK ("supersedes_id" IS NULL OR "supersedes_id" <> "id");
