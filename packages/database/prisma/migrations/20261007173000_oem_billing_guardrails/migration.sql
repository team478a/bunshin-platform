-- Existing enum/application already support these consented states. Preserve all prior predicates.
ALTER TABLE "group_memberships" DROP CONSTRAINT "group_memberships_state_check";
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_state_check" CHECK (
 ("status" IN ('ACTIVE','SUSPENDED','PENDING_APPROVAL') AND "consented_at" IS NOT NULL AND "revoked_at" IS NULL)
 OR ("status" = 'DECLINED' AND "declined_at" IS NOT NULL)
 OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
 OR "status" = 'INVITED'
);

-- SQL CHECK accepts NULL; require every V2 count rather than accidentally accepting UNKNOWN.
ALTER TABLE "tenant_monthly_usage" DROP CONSTRAINT "usage_billing_counts";
ALTER TABLE "tenant_monthly_usage" ADD CONSTRAINT "usage_billing_counts" CHECK (
 ("billing_rule_version" IS NULL AND "billable_user_count" IS NULL)
 OR ("billing_rule_version" IS NOT NULL AND "billable_user_count" IS NOT NULL
 AND "registered_user_count" IS NOT NULL AND "free_active_user_count" IS NOT NULL AND "overlap_user_count" IS NOT NULL
 AND "billable_user_count" >= 0 AND "registered_user_count" >= 0 AND "free_active_user_count" >= 0 AND "overlap_user_count" >= 0
 AND "overlap_user_count" <= LEAST("registered_user_count","free_active_user_count")
 AND "billable_user_count" = "registered_user_count" + "free_active_user_count" - "overlap_user_count")
);

CREATE OR REPLACE FUNCTION "protect_commercial_pricing"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."status" = 'CANCELLED' THEN RAISE EXCEPTION 'cancelled pricing is immutable'; END IF;
 IF OLD."status" = 'PUBLISHED' THEN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'published pricing is immutable'; END IF;
  IF NEW."tiers" IS DISTINCT FROM OLD."tiers" OR NEW."version" <> OLD."version" OR NEW."name" <> OLD."name"
    OR NEW."change_reason" <> OLD."change_reason" OR NEW."effective_from" <> OLD."effective_from"
    OR NEW."status" <> 'CANCELLED' OR NEW."created_by_user_id" <> OLD."created_by_user_id" OR NEW."created_at" <> OLD."created_at"
    OR NEW."revision" <> OLD."revision" + 1
    OR OLD."effective_from" <= date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date
    OR EXISTS (SELECT 1 FROM "tenant_monthly_usage" WHERE "pricing_schedule_id" = OLD."id" AND "status" = 'FINALIZED')
    OR EXISTS (SELECT 1 FROM "tenant_invoices" WHERE "pricing_schedule_id" = OLD."id")
  THEN RAISE EXCEPTION 'published pricing is immutable'; END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;

-- Only closing an open period is mutable; historical identity/classification cannot be rewritten.
CREATE FUNCTION "protect_oem_period"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'OEM billing history cannot be deleted'; END IF;
 IF OLD."ends_at" IS NOT NULL OR NEW."ends_at" IS NULL
    OR (to_jsonb(NEW) - ARRAY['ends_at','ended_by_user_id','end_reason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['ends_at','ended_by_user_id','end_reason'])
 THEN RAISE EXCEPTION 'OEM billing history is immutable except explicit end'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "oem_registration_history" BEFORE UPDATE OR DELETE ON "oem_registration_periods" FOR EACH ROW EXECUTE FUNCTION "protect_oem_period"();
CREATE TRIGGER "oem_offering_history" BEFORE UPDATE OR DELETE ON "oem_offering_periods" FOR EACH ROW EXECUTE FUNCTION "protect_oem_period"();
CREATE TRIGGER "oem_contract_history" BEFORE UPDATE OR DELETE ON "oem_contract_periods" FOR EACH ROW EXECUTE FUNCTION "protect_oem_period"();
