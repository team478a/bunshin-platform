ALTER TABLE "mission_content_variant_generations"
ADD COLUMN "quality_verdict" VARCHAR(20),
ADD COLUMN "quality_score" INTEGER,
ADD COLUMN "quality_issue_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "quality_repair_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "mission_content_variant_generations"
ADD CONSTRAINT "mission_variant_generation_quality_verdict_check"
CHECK ("quality_verdict" IS NULL OR "quality_verdict" IN ('PASS', 'REVISE', 'REJECT')),
ADD CONSTRAINT "mission_variant_generation_quality_score_check"
CHECK ("quality_score" IS NULL OR ("quality_score" >= 0 AND "quality_score" <= 100)),
ADD CONSTRAINT "mission_variant_generation_quality_repair_count_check"
CHECK ("quality_repair_count" >= 0 AND "quality_repair_count" <= 1),
ADD CONSTRAINT "mission_variant_generation_quality_pair_check"
CHECK (("quality_verdict" IS NULL) = ("quality_score" IS NULL));
