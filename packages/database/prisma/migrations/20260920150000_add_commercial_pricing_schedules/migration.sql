CREATE TABLE "commercial_pricing_schedules" (
  "id" UUID NOT NULL,
  "version" VARCHAR(80) NOT NULL,
  "effective_from" DATE NOT NULL,
  "tiers" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_pricing_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commercial_pricing_schedules_version_key" ON "commercial_pricing_schedules"("version");
CREATE UNIQUE INDEX "commercial_pricing_schedules_effective_from_key" ON "commercial_pricing_schedules"("effective_from");
CREATE INDEX "commercial_pricing_schedules_effective_from_idx" ON "commercial_pricing_schedules"("effective_from");

ALTER TABLE "commercial_pricing_schedules" ENABLE ROW LEVEL SECURITY;
