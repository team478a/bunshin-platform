CREATE TYPE "TrainingSupportSkillOperationalStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'RETIRED');
CREATE TYPE "TrainingSupportSkillVersionDisposition" AS ENUM ('APPROVED', 'ACTIVE', 'DEPRECATED', 'REVOKED');
CREATE TYPE "TrainingSupportSkillOperation" AS ENUM ('ADOPT', 'ACTIVATE', 'SUSPEND', 'ROLLBACK', 'REVOKE', 'RETIRE');

CREATE TABLE "training_support_skills" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "skill_key" VARCHAR(120) NOT NULL,
    "program_template_version_id" UUID NOT NULL,
    "mission_definition_key" VARCHAR(80) NOT NULL,
    "learning_objective_key" VARCHAR(80) NOT NULL,
    "assignment_variant" VARCHAR(16) NOT NULL,
    "current_version_id" UUID,
    "operational_status" "TrainingSupportSkillOperationalStatus" NOT NULL DEFAULT 'SUSPENDED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "training_support_skills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "training_support_skills_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "training_support_skills_variant_check" CHECK ("assignment_variant" IN ('STANDARD', 'SHORT')),
    CONSTRAINT "training_support_skills_current_status_check" CHECK (
      ("operational_status" = 'ACTIVE' AND "current_version_id" IS NOT NULL)
      OR ("operational_status" = 'SUSPENDED')
      OR ("operational_status" = 'RETIRED' AND "current_version_id" IS NULL)
    )
);

CREATE TABLE "training_support_skill_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "training_support_skill_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "disposition" "TrainingSupportSkillVersionDisposition" NOT NULL,
    "artifact_contract_version" VARCHAR(80) NOT NULL,
    "validation_policy_version" VARCHAR(80) NOT NULL,
    "source_problem_id" VARCHAR(160) NOT NULL,
    "source_problem_revision" INTEGER NOT NULL,
    "source_skill_draft_id" VARCHAR(160) NOT NULL,
    "source_skill_draft_revision" INTEGER NOT NULL,
    "source_artifact_id" VARCHAR(160) NOT NULL,
    "source_artifact_revision" INTEGER NOT NULL,
    "scope_fingerprint" VARCHAR(160) NOT NULL,
    "content_digest" CHAR(71) NOT NULL,
    "steps" JSONB NOT NULL,
    "expected_output" TEXT NOT NULL,
    "success_criteria_keys" JSONB NOT NULL,
    "barrier_reason_code" VARCHAR(80),
    "approved_by_user_id" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ(3) NOT NULL,
    "deprecated_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "training_support_skill_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "training_support_skill_versions_number_check" CHECK ("version" > 0),
    CONSTRAINT "training_support_skill_versions_source_revision_check" CHECK (
      "source_problem_revision" > 0 AND "source_skill_draft_revision" > 0 AND "source_artifact_revision" > 0
    ),
    CONSTRAINT "training_support_skill_versions_digest_check" CHECK (
      "content_digest" ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT "training_support_skill_versions_steps_check" CHECK (
      jsonb_typeof("steps") = 'array'
      AND jsonb_array_length("steps") BETWEEN 1 AND 5
    ),
    CONSTRAINT "training_support_skill_versions_success_keys_check" CHECK (
      jsonb_typeof("success_criteria_keys") = 'array'
    ),
    CONSTRAINT "training_support_skill_versions_size_check" CHECK (
      octet_length("steps"::text) + octet_length("expected_output") + octet_length("success_criteria_keys"::text) <= 4096
    ),
    CONSTRAINT "training_support_skill_versions_lifecycle_check" CHECK (
      ("disposition" = 'REVOKED' AND "revoked_at" IS NOT NULL)
      OR ("disposition" <> 'REVOKED' AND "revoked_at" IS NULL)
    )
);

CREATE TABLE "training_support_skill_activations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "training_support_skill_id" UUID NOT NULL,
    "skill_version_id" UUID,
    "prior_skill_version_id" UUID,
    "operation" "TrainingSupportSkillOperation" NOT NULL,
    "reason_code" VARCHAR(80) NOT NULL,
    "expected_skill_revision" INTEGER NOT NULL,
    "resulting_skill_revision" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_service_role" "ServiceRole" NOT NULL,
    "rollback_compatibility" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "training_support_skill_activations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "training_support_skill_activations_revision_check" CHECK (
      "expected_skill_revision" >= 0 AND "resulting_skill_revision" = "expected_skill_revision" + 1
    ),
    CONSTRAINT "training_support_skill_activations_role_check" CHECK (
      "actor_service_role" IN ('SERVICE_OWNER', 'SERVICE_ADMIN')
    ),
    CONSTRAINT "training_support_skill_activations_reason_check" CHECK (
      ("operation" = 'ADOPT' AND "reason_code" = 'INITIAL_HUMAN_APPROVAL')
      OR ("operation" = 'ACTIVATE' AND "reason_code" = 'HUMAN_APPROVED_ACTIVATION')
      OR ("operation" = 'SUSPEND' AND "reason_code" IN ('SAFETY_REVIEW_REQUIRED', 'OUTCOME_REVIEW_REQUIRED', 'MANUAL_OPERATIONAL_STOP'))
      OR ("operation" = 'ROLLBACK' AND "reason_code" IN ('CURRENT_VERSION_REGRESSION', 'CURRENT_VERSION_INCOMPATIBLE', 'MANUAL_VERSION_RESTORE'))
      OR ("operation" = 'REVOKE' AND "reason_code" IN ('SAFETY_POLICY_VIOLATION', 'CONTRACT_INVALIDATED'))
      OR ("operation" = 'RETIRE' AND "reason_code" IN ('SKILL_NO_LONGER_REQUIRED', 'PROGRAM_VERSION_RETIRED'))
    ),
    CONSTRAINT "training_support_skill_activations_rollback_check" CHECK (
      ("operation" = 'ROLLBACK' AND "rollback_compatibility" = '{"PROGRAM_VERSION":"PASSED","MISSION":"PASSED","LEARNING_OBJECTIVE":"PASSED","ASSIGNMENT_VARIANT":"PASSED","VALIDATION_POLICY":"PASSED"}'::jsonb)
      OR ("operation" <> 'ROLLBACK' AND "rollback_compatibility" IS NULL)
    )
);

CREATE UNIQUE INDEX "training_support_skills_scope_key"
  ON "training_support_skills"("workspace_id", "group_id", "skill_key");
CREATE UNIQUE INDEX "training_support_skills_scope_id_key"
  ON "training_support_skills"("workspace_id", "group_id", "id");
CREATE INDEX "training_support_skills_scope_status_idx"
  ON "training_support_skills"("workspace_id", "group_id", "operational_status");
CREATE UNIQUE INDEX "training_support_skill_versions_number_key"
  ON "training_support_skill_versions"("training_support_skill_id", "version");
CREATE UNIQUE INDEX "training_support_skill_versions_scope_id_key"
  ON "training_support_skill_versions"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "training_support_skill_versions_scope_skill_id_key"
  ON "training_support_skill_versions"("workspace_id", "group_id", "training_support_skill_id", "id");
CREATE INDEX "training_support_skill_versions_scope_status_idx"
  ON "training_support_skill_versions"("workspace_id", "group_id", "training_support_skill_id", "disposition");
CREATE UNIQUE INDEX "training_support_skill_versions_one_active_key"
  ON "training_support_skill_versions"("training_support_skill_id") WHERE "disposition" = 'ACTIVE';
CREATE UNIQUE INDEX "training_support_skill_activations_idempotency_key"
  ON "training_support_skill_activations"("workspace_id", "group_id", "idempotency_key");
CREATE UNIQUE INDEX "training_support_skill_activations_scope_id_key"
  ON "training_support_skill_activations"("workspace_id", "group_id", "id");
CREATE INDEX "training_support_skill_activations_scope_skill_idx"
  ON "training_support_skill_activations"("workspace_id", "group_id", "training_support_skill_id", "occurred_at");

ALTER TABLE "training_support_skills"
  ADD CONSTRAINT "training_support_skills_group_fkey"
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "training_support_skills_program_version_fkey"
  FOREIGN KEY ("workspace_id", "program_template_version_id") REFERENCES "program_template_versions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "training_support_skill_versions"
  ADD CONSTRAINT "training_support_skill_versions_skill_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "training_support_skill_id") REFERENCES "training_support_skills"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "training_support_skill_versions_approver_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "training_support_skills"
  ADD CONSTRAINT "training_support_skills_current_version_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "id", "current_version_id") REFERENCES "training_support_skill_versions"("workspace_id", "group_id", "training_support_skill_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "training_support_skill_activations"
  ADD CONSTRAINT "training_support_skill_activations_skill_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "training_support_skill_id") REFERENCES "training_support_skills"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "training_support_skill_activations_version_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "training_support_skill_id", "skill_version_id") REFERENCES "training_support_skill_versions"("workspace_id", "group_id", "training_support_skill_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "training_support_skill_activations_prior_version_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "training_support_skill_id", "prior_skill_version_id") REFERENCES "training_support_skill_versions"("workspace_id", "group_id", "training_support_skill_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "training_support_skill_activations_actor_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "training_support_skill_versions_immutable"() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['disposition', 'deprecated_at', 'revoked_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['disposition', 'deprecated_at', 'revoked_at']) THEN
    RAISE EXCEPTION 'training support skill version content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "training_support_skill_versions_immutable_trigger"
  BEFORE UPDATE ON "training_support_skill_versions"
  FOR EACH ROW EXECUTE FUNCTION "training_support_skill_versions_immutable"();

CREATE FUNCTION "training_support_skill_history_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'training support skill history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "training_support_skill_versions_no_delete_trigger"
  BEFORE DELETE ON "training_support_skill_versions"
  FOR EACH ROW EXECUTE FUNCTION "training_support_skill_history_append_only"();
CREATE TRIGGER "training_support_skill_activations_append_only_trigger"
  BEFORE UPDATE OR DELETE ON "training_support_skill_activations"
  FOR EACH ROW EXECUTE FUNCTION "training_support_skill_history_append_only"();

ALTER TABLE "training_support_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_support_skill_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_support_skill_activations" ENABLE ROW LEVEL SECURITY;
