CREATE TYPE "UserEvidenceType" AS ENUM ('EXPERIENCE','USAGE','RESULT','QUALIFICATION');
CREATE TYPE "UserEvidenceStatus" AS ENUM ('ACTIVE','REVOKED');
CREATE TYPE "AdvertisingClassification" AS ENUM ('ORGANIC','PRODUCT_RELATED','ADVERTISEMENT');
CREATE TYPE "AdvertisingEvidenceRequirement" AS ENUM ('NONE','PERSONAL_EVIDENCE');
CREATE TYPE "AdvertisingSafetyVerdict" AS ENUM ('PASS','BLOCKED');

CREATE TABLE "user_evidence" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "type" "UserEvidenceType" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "claim" VARCHAR(1000) NOT NULL,
  "source_url" VARCHAR(2048),
  "occurred_at" TIMESTAMPTZ(6),
  "status" "UserEvidenceStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "user_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "advertising_safety_reviews" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "daily_mission_id" UUID,
  "product_pack_version_id" UUID,
  "classification" "AdvertisingClassification" NOT NULL,
  "evidence_requirement" "AdvertisingEvidenceRequirement" NOT NULL,
  "evidence_ids" UUID[] NOT NULL,
  "official_claims" JSONB NOT NULL,
  "required_disclosures" TEXT[] NOT NULL,
  "issue_codes" TEXT[] NOT NULL,
  "verdict" "AdvertisingSafetyVerdict" NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "reviewed_by_user_id" UUID NOT NULL,
  "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "advertising_safety_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_evidence_workspace_id_bunshin_id_status_idx" ON "user_evidence"("workspace_id","bunshin_id","status");
CREATE INDEX "advertising_safety_reviews_workspace_id_bunshin_id_reviewed_at_idx" ON "advertising_safety_reviews"("workspace_id","bunshin_id","reviewed_at");
CREATE INDEX "advertising_safety_reviews_product_pack_version_id_verdict_idx" ON "advertising_safety_reviews"("product_pack_version_id","verdict");

ALTER TABLE "user_evidence" ADD CONSTRAINT "user_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_evidence" ADD CONSTRAINT "user_evidence_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id","bunshin_id") REFERENCES "bunshins"("workspace_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_evidence" ADD CONSTRAINT "user_evidence_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advertising_safety_reviews" ADD CONSTRAINT "advertising_safety_reviews_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advertising_safety_reviews" ADD CONSTRAINT "advertising_safety_reviews_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id","bunshin_id") REFERENCES "bunshins"("workspace_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advertising_safety_reviews" ADD CONSTRAINT "advertising_safety_reviews_daily_mission_id_fkey" FOREIGN KEY ("daily_mission_id") REFERENCES "daily_missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "advertising_safety_reviews" ADD CONSTRAINT "advertising_safety_reviews_product_pack_version_id_fkey" FOREIGN KEY ("product_pack_version_id") REFERENCES "product_pack_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advertising_safety_reviews" ADD CONSTRAINT "advertising_safety_reviews_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
