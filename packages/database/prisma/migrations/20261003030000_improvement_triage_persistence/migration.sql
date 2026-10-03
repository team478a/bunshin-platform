CREATE INDEX "improvement_feedback_actor_user_id_idx" ON "improvement_feedback" ("actor_user_id");
CREATE INDEX "improvement_feedback_bunshin_id_idx" ON "improvement_feedback" ("bunshin_id");
CREATE TABLE "improvement_triage_candidates" (
  "id" UUID NOT NULL, "tenant_ref" VARCHAR(240) NOT NULL,
  "workspace_id" UUID NOT NULL, "service_id" UUID NOT NULL,
  "environment" VARCHAR(20) NOT NULL, "package_key" VARCHAR(30) NOT NULL,
  "adapter_key" VARCHAR(30) NOT NULL, "from_inclusive" TIMESTAMPTZ(6) NOT NULL,
  "to_exclusive" TIMESTAMPTZ(6) NOT NULL, "cluster_ref" CHAR(64) NOT NULL,
  "window_evidence_revision" CHAR(64), "bucket_evidence_revision" CHAR(64),
  "adapter_version" VARCHAR(120) NOT NULL, "rule_version" VARCHAR(120) NOT NULL,
  "disclosure_policy_version" VARCHAR(120) NOT NULL, "retention_policy_version" VARCHAR(120) NOT NULL,
  "candidate_revision" INTEGER NOT NULL DEFAULT 1, "state" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  "expires_at" TIMESTAMPTZ(6) NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "improvement_triage_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "improvement_triage_candidates_workspace_id_service_id_fkey"
    FOREIGN KEY ("workspace_id", "service_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "triage_candidate_contract" CHECK (
    "candidate_revision" > 0 AND "state" IN ('OPEN','REVIEWED','DISMISSED','STALE')
    AND "package_key" = 'SOCIAL' AND "adapter_key" = 'TROUBLE_FEEDBACK'
    AND "environment" IN ('PRODUCTION','STAGING','DEVELOPMENT')
    AND "to_exclusive" = "from_inclusive" + interval '7 days'
    AND extract(isodow from "from_inclusive" AT TIME ZONE 'Asia/Tokyo') = 1
    AND ("from_inclusive" AT TIME ZONE 'Asia/Tokyo')::time = time '00:00:00'
    AND "expires_at" = "to_exclusive" + interval '90 days'
    AND "retention_policy_version" = 'feedback-retention-v1'
    AND "disclosure_policy_version" = 'feedback-admin-preview-v1'
    AND "adapter_version" = 'trouble-feedback-v1' AND "rule_version" = 'selected-feedback-review-v1'
    AND "cluster_ref" ~ '^[a-f0-9]{64}$'
    AND (("state" = 'STALE' AND "window_evidence_revision" IS NULL AND "bucket_evidence_revision" IS NULL)
      OR ("state" <> 'STALE' AND "window_evidence_revision" ~ '^[a-f0-9]{64}$'
        AND "bucket_evidence_revision" ~ '^[a-f0-9]{64}$'
        AND "window_evidence_revision" IS NOT NULL AND "bucket_evidence_revision" IS NOT NULL))
  )
);
CREATE UNIQUE INDEX "triage_candidate_scope_cluster" ON "improvement_triage_candidates"
 ("tenant_ref","workspace_id","service_id","environment","package_key","adapter_key","cluster_ref");
CREATE INDEX "triage_candidate_scope_period"
 ON "improvement_triage_candidates" ("workspace_id","service_id","from_inclusive","to_exclusive");
CREATE INDEX "improvement_triage_candidates_expires_at_idx" ON "improvement_triage_candidates" ("expires_at");

CREATE TABLE "improvement_triage_operations" (
  "id" UUID NOT NULL, "tenant_ref" VARCHAR(240) NOT NULL,
  "workspace_id" UUID NOT NULL, "service_id" UUID NOT NULL,
  "environment" VARCHAR(20) NOT NULL, "package_key" VARCHAR(30) NOT NULL, "adapter_key" VARCHAR(30) NOT NULL,
  "operation_key" UUID NOT NULL, "candidate_id" UUID, "actor_user_id" UUID,
  "expected_candidate_revision" INTEGER NOT NULL, "action" VARCHAR(20) NOT NULL,
  "reason_code" VARCHAR(30) NOT NULL, "result_revision" INTEGER NOT NULL,
  "result_state" VARCHAR(20) NOT NULL, "occurred_at" TIMESTAMPTZ(6) NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "improvement_triage_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "improvement_triage_operations_workspace_id_service_id_fkey"
    FOREIGN KEY ("workspace_id","service_id") REFERENCES "groups"("workspace_id","id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "improvement_triage_operations_candidate_id_fkey"
    FOREIGN KEY ("candidate_id") REFERENCES "improvement_triage_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "improvement_triage_operations_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "triage_operation_contract" CHECK (
    "package_key" = 'SOCIAL' AND "adapter_key" = 'TROUBLE_FEEDBACK'
    AND "environment" IN ('PRODUCTION','STAGING','DEVELOPMENT')
    AND "expected_candidate_revision" > 0 AND "result_revision" = "expected_candidate_revision" + 1
    AND "expires_at" = "occurred_at" + interval '180 days'
    AND (("action" = 'MARK_REVIEWED' AND "reason_code" = 'REVIEW_COMPLETED' AND "result_state" = 'REVIEWED')
      OR ("action" = 'DISMISS' AND "reason_code" IN ('OUT_OF_SCOPE','DUPLICATE_REVIEW') AND "result_state" = 'DISMISSED'))
  )
);
CREATE UNIQUE INDEX "triage_operation_scope_key" ON "improvement_triage_operations"
 ("tenant_ref","workspace_id","service_id","environment","package_key","adapter_key","operation_key");
CREATE INDEX "improvement_triage_operations_actor_user_id_idx" ON "improvement_triage_operations" ("actor_user_id");
CREATE INDEX "improvement_triage_operations_expires_at_idx" ON "improvement_triage_operations" ("expires_at");

CREATE FUNCTION validate_feedback_triage_operation_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.candidate_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM improvement_triage_candidates c WHERE c.id = NEW.candidate_id
      AND c.workspace_id = NEW.workspace_id AND c.service_id = NEW.service_id
      AND c.tenant_ref = NEW.tenant_ref AND c.environment = NEW.environment
      AND c.package_key = NEW.package_key AND c.adapter_key = NEW.adapter_key
  ) THEN RAISE EXCEPTION 'invalid triage operation scope'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER feedback_triage_operation_scope BEFORE INSERT OR UPDATE ON improvement_triage_operations
 FOR EACH ROW EXECUTE FUNCTION validate_feedback_triage_operation_scope();

-- The Service row is the common lock boundary, including raw SQL/cascading source deletion.
-- BEFORE mutation: lock and erase both personal-derived hashes in the same transaction.
CREATE FUNCTION invalidate_feedback_triage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT workspace_id, service_id, created_at FROM (
    SELECT OLD.workspace_id, OLD.service_id, OLD.created_at WHERE TG_OP <> 'INSERT'
    UNION ALL SELECT NEW.workspace_id, NEW.service_id, NEW.created_at WHERE TG_OP <> 'DELETE'
  ) sources ORDER BY workspace_id, service_id, created_at LOOP
    PERFORM id FROM groups WHERE workspace_id = r.workspace_id AND id = r.service_id FOR UPDATE;
    UPDATE improvement_triage_candidates SET state = 'STALE', window_evidence_revision = NULL,
      bucket_evidence_revision = NULL, candidate_revision = LEAST(candidate_revision::bigint + 1, 2147483647)::integer,
      updated_at = clock_timestamp()
    WHERE workspace_id = r.workspace_id AND service_id = r.service_id
      AND from_inclusive <= r.created_at AND to_exclusive > r.created_at AND state <> 'STALE';
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER feedback_triage_source_mutation BEFORE INSERT OR UPDATE OR DELETE ON improvement_feedback
 FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_triage();

-- A source still stored under the old stamp must not retain a review after ownership moves.
CREATE FUNCTION invalidate_feedback_triage_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id OR OLD.group_id IS DISTINCT FROM NEW.group_id
     OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
    PERFORM g.id FROM groups g WHERE EXISTS (
      SELECT 1 FROM improvement_feedback f WHERE f.bunshin_id = OLD.id
       AND f.workspace_id = g.workspace_id AND f.service_id = g.id
    ) ORDER BY g.id FOR UPDATE;
    UPDATE improvement_triage_candidates c SET state = 'STALE', window_evidence_revision = NULL,
      bucket_evidence_revision = NULL, candidate_revision = LEAST(candidate_revision::bigint + 1, 2147483647)::integer,
      updated_at = clock_timestamp()
    WHERE c.state <> 'STALE' AND EXISTS (SELECT 1 FROM improvement_feedback f WHERE f.bunshin_id = OLD.id
      AND f.workspace_id = c.workspace_id AND f.service_id = c.service_id
      AND f.created_at >= c.from_inclusive AND f.created_at < c.to_exclusive);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER feedback_triage_owner_mutation BEFORE UPDATE ON bunshins
 FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_triage_ownership();

CREATE FUNCTION erase_deleted_user_feedback() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.status::text = 'DELETED' THEN
    DELETE FROM improvement_feedback WHERE actor_user_id = OLD.id;
    UPDATE improvement_triage_operations SET actor_user_id = NULL WHERE actor_user_id = OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER feedback_triage_user_deletion BEFORE UPDATE OF status OR DELETE ON users
 FOR EACH ROW EXECUTE FUNCTION erase_deleted_user_feedback();

CREATE FUNCTION erase_deleted_service_feedback() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM improvement_feedback WHERE workspace_id = OLD.workspace_id AND service_id = OLD.id;
  RETURN OLD;
END $$;
CREATE TRIGGER feedback_triage_service_deletion BEFORE DELETE ON groups
 FOR EACH ROW EXECUTE FUNCTION erase_deleted_service_feedback();

-- Already completed deletions predate the trigger. Do not keep their raw signals.
-- No organization asset itself is removed; only the approved personal-feedback signal.
DELETE FROM improvement_feedback f USING users u
 WHERE f.actor_user_id = u.id AND u.status::text = 'DELETED';
DELETE FROM improvement_feedback f USING bunshins b, users u
 WHERE f.bunshin_id = b.id AND b.owner_user_id = u.id AND u.status::text = 'DELETED';
