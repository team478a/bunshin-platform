BEGIN;
SET LOCAL lock_timeout = '5000ms';
SET LOCAL statement_timeout = '60000ms';
SET LOCAL idle_in_transaction_session_timeout = '60000ms';

-- Platform-owned service product catalog. OEM is a delivery/contract mode, not a product name.
CREATE TABLE "commercial_service_products" (
  "id" UUID NOT NULL,
  "key" VARCHAR(40) NOT NULL,
  "display_name" VARCHAR(120) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "commercial_service_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_service_product_key_format" CHECK ("key" ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  CONSTRAINT "commercial_service_product_status" CHECK ("status" IN ('ACTIVE','RETIRED'))
);

CREATE UNIQUE INDEX "commercial_service_products_key_key"
  ON "commercial_service_products"("key");
CREATE UNIQUE INDEX "commercial_service_products_id_key_key"
  ON "commercial_service_products"("id", "key");
CREATE INDEX "commercial_service_products_status_key_idx"
  ON "commercial_service_products"("status", "key");

CREATE TABLE "commercial_service_product_policy_versions" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "free_offering_allowed" BOOLEAN NOT NULL DEFAULT true,
  "required_capabilities" TEXT[] NOT NULL,
  "effective_from" DATE NOT NULL,
  "created_by_user_id" UUID,
  "reason" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_service_product_policy_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_service_product_policy_version_positive" CHECK ("version" > 0),
  CONSTRAINT "commercial_service_product_policy_capabilities_nonempty"
    CHECK (NOT ("required_capabilities" @> ARRAY['']::TEXT[]))
);

CREATE UNIQUE INDEX "commercial_service_product_policy_versions_product_id_version_key"
  ON "commercial_service_product_policy_versions"("product_id", "version");
CREATE UNIQUE INDEX "commercial_service_product_policy_versions_product_id_id_key"
  ON "commercial_service_product_policy_versions"("product_id", "id");
CREATE INDEX "commercial_service_product_policy_versions_product_id_effective_from_idx"
  ON "commercial_service_product_policy_versions"("product_id", "effective_from");
ALTER TABLE "commercial_service_product_policy_versions"
  ADD CONSTRAINT "commercial_service_product_policy_product_fk"
  FOREIGN KEY ("product_id") REFERENCES "commercial_service_products"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Preserve the two existing products as explicit data, not branching logic.
INSERT INTO "commercial_service_products"
  ("id", "key", "display_name", "status", "created_by_user_id", "updated_at")
VALUES
  ('0eecf528-5f47-4ff0-9279-61d5a4207721', 'HASSY', 'ハッシー', 'ACTIVE', NULL, CURRENT_TIMESTAMP),
  ('6d76fca6-bf1d-4bdc-a173-eeb14d29f6ad', 'MANABERU_STYLE', 'マナベルスタイル', 'ACTIVE', NULL, CURRENT_TIMESTAMP);

INSERT INTO "commercial_service_product_policy_versions"
  ("id", "product_id", "version", "free_offering_allowed", "required_capabilities", "effective_from", "created_by_user_id", "reason")
VALUES
  ('0eecf528-5f47-4ff0-9279-61d5a4207722', '0eecf528-5f47-4ff0-9279-61d5a4207721', 1, true, ARRAY[]::TEXT[], DATE '1970-01-01', NULL, 'Existing HASSY policy migrated without changing billing behavior'),
  ('6d76fca6-bf1d-4bdc-a173-eeb14d29f6ae', '6d76fca6-bf1d-4bdc-a173-eeb14d29f6ad', 1, false, ARRAY['AI_TRAINING']::TEXT[], DATE '1970-01-01', NULL, 'Existing MANABERU_STYLE policy migrated without changing billing behavior');

ALTER TABLE "oem_offering_periods"
  ADD COLUMN "product_id" UUID,
  ADD COLUMN "product_policy_version_id" UUID;

UPDATE "oem_offering_periods" AS offering
SET
  "product_id" = product."id",
  "product_policy_version_id" = policy."id"
FROM "commercial_service_products" AS product
JOIN "commercial_service_product_policy_versions" AS policy
  ON policy."product_id" = product."id" AND policy."version" = 1
WHERE product."key" = offering."product_policy";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "oem_offering_periods"
    WHERE "product_id" IS NULL OR "product_policy_version_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'REVIEW_REQUIRED: unknown existing OEM service product';
  END IF;
END $$;

ALTER TABLE "oem_offering_periods"
  ALTER COLUMN "product_id" SET NOT NULL,
  ALTER COLUMN "product_policy_version_id" SET NOT NULL;

ALTER TABLE "oem_offering_periods" DROP CONSTRAINT "oem_offering_valid";
ALTER TABLE "oem_offering_periods" ADD CONSTRAINT "oem_offering_valid"
  CHECK (
    "classification" IN ('FREE','PAID','PAID_BUNDLE')
    AND ("ends_at" IS NULL OR "ends_at" > "starts_at")
  );

CREATE INDEX "oem_offering_periods_product_id_product_policy_version_id_idx"
  ON "oem_offering_periods"("product_id", "product_policy_version_id");
ALTER TABLE "oem_offering_periods"
  ADD CONSTRAINT "oem_offering_product_fk"
  FOREIGN KEY ("product_id", "product_policy")
  REFERENCES "commercial_service_products"("id", "key")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "oem_offering_periods"
  ADD CONSTRAINT "oem_offering_product_policy_version_fk"
  FOREIGN KEY ("product_id", "product_policy_version_id")
  REFERENCES "commercial_service_product_policy_versions"("product_id", "id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE FUNCTION "validate_oem_service_product_offering"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  product_status VARCHAR(20);
  free_allowed BOOLEAN;
  policy_effective_from DATE;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW."product_id" = OLD."product_id"
    AND NEW."product_policy_version_id" = OLD."product_policy_version_id"
    AND NEW."product_policy" = OLD."product_policy"
    AND NEW."classification" = OLD."classification"
    AND NEW."starts_at" = OLD."starts_at"
  THEN
    RETURN NEW;
  END IF;

  SELECT product."status", policy."free_offering_allowed", policy."effective_from"
    INTO product_status, free_allowed, policy_effective_from
  FROM "commercial_service_products" AS product
  JOIN "commercial_service_product_policy_versions" AS policy
    ON policy."product_id" = product."id"
  WHERE product."id" = NEW."product_id"
    AND product."key" = NEW."product_policy"
    AND policy."id" = NEW."product_policy_version_id";

  IF product_status IS NULL OR product_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'REVIEW_REQUIRED: inactive OEM service product';
  END IF;
  IF policy_effective_from > (NEW."starts_at" AT TIME ZONE 'Asia/Tokyo')::date THEN
    RAISE EXCEPTION 'REVIEW_REQUIRED: OEM service product policy is not effective';
  END IF;
  IF NEW."classification" = 'FREE' AND NOT free_allowed THEN
    RAISE EXCEPTION 'OEM_PRODUCT_FREE_OFFERING_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "oem_service_product_offering_valid"
  BEFORE INSERT OR UPDATE ON "oem_offering_periods"
  FOR EACH ROW EXECUTE FUNCTION "validate_oem_service_product_offering"();

CREATE FUNCTION "protect_commercial_service_product_policy_version"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'commercial service product policy versions are immutable';
END;
$$;

CREATE TRIGGER "commercial_service_product_policy_version_immutable"
  BEFORE UPDATE OR DELETE ON "commercial_service_product_policy_versions"
  FOR EACH ROW EXECUTE FUNCTION "protect_commercial_service_product_policy_version"();

ALTER TABLE "commercial_service_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_service_product_policy_versions" ENABLE ROW LEVEL SECURITY;
COMMIT;
