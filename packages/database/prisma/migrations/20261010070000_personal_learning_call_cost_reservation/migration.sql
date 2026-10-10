-- Additive, fail-closed cost reservation. Existing rows stay NULL and block same-day admission.
ALTER TABLE "personal_learning_call_admissions"
  ADD COLUMN "reserved_cost_usd_micros" BIGINT,
  ADD COLUMN "pricing_version" VARCHAR(120),
  ADD CONSTRAINT "personal_learning_call_admissions_cost_pair_check"
    CHECK (
      ("reserved_cost_usd_micros" IS NULL AND "pricing_version" IS NULL)
      OR
      ("reserved_cost_usd_micros" > 0 AND "pricing_version" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$')
    );
