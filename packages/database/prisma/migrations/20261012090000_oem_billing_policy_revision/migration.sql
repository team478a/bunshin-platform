CREATE TYPE "OemBillingPolicyRevisionAction" AS ENUM ('RESCHEDULED', 'CANCELLED');

CREATE TABLE "oem_billing_policy_revisions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "action" "OemBillingPolicyRevisionAction" NOT NULL,
  "effective_from" DATE,
  "rule_version" VARCHAR(80),
  "history_ready_at" TIMESTAMPTZ(6),
  "actor_user_id" UUID NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "supersedes_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oem_billing_policy_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oem_policy_revision_state_valid" CHECK (
    ("action" = 'RESCHEDULED' AND "effective_from" IS NOT NULL AND "rule_version" IS NOT NULL AND "history_ready_at" IS NOT NULL)
    OR
    ("action" = 'CANCELLED' AND "effective_from" IS NULL AND "rule_version" IS NULL AND "history_ready_at" IS NULL)
  ),
  CONSTRAINT "oem_policy_revision_no_self_supersession" CHECK (
    "supersedes_id" IS NULL OR "supersedes_id" <> "id"
  )
);

CREATE UNIQUE INDEX "oem_billing_policy_revisions_supersedes_id_key"
ON "oem_billing_policy_revisions"("supersedes_id");

CREATE UNIQUE INDEX "oem_billing_policy_revision_one_root"
ON "oem_billing_policy_revisions"("workspace_id")
WHERE "supersedes_id" IS NULL;

CREATE INDEX "oem_billing_policy_revisions_workspace_id_created_at_idx"
ON "oem_billing_policy_revisions"("workspace_id", "created_at");

ALTER TABLE "oem_billing_policy_revisions"
ADD CONSTRAINT "oem_policy_revision_policy_fk"
FOREIGN KEY ("workspace_id") REFERENCES "oem_billing_policies"("workspace_id")
ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "oem_billing_policy_revisions"
ADD CONSTRAINT "oem_policy_revision_supersedes_fk"
FOREIGN KEY ("supersedes_id") REFERENCES "oem_billing_policy_revisions"("id")
ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE FUNCTION "protect_oem_billing_policy_revision"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'OEM billing policy revisions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "enforce_oem_billing_policy_revision_workspace"() RETURNS trigger AS $$
BEGIN
  IF NEW."supersedes_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "oem_billing_policy_revisions" predecessor
    WHERE predecessor."id" = NEW."supersedes_id"
      AND predecessor."workspace_id" = NEW."workspace_id"
  ) THEN
    RAISE EXCEPTION 'OEM billing policy revision supersession must stay within one workspace';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "oem_billing_policy_revision_workspace"
BEFORE INSERT ON "oem_billing_policy_revisions"
FOR EACH ROW EXECUTE FUNCTION "enforce_oem_billing_policy_revision_workspace"();

CREATE TRIGGER "oem_billing_policy_revision_history"
BEFORE UPDATE OR DELETE ON "oem_billing_policy_revisions"
FOR EACH ROW EXECUTE FUNCTION "protect_oem_billing_policy_revision"();

ALTER TABLE "oem_billing_policy_revisions" ENABLE ROW LEVEL SECURITY;
