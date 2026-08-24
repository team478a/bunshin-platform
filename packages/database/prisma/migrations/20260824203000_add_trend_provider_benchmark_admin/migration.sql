CREATE TABLE "trend_provider_benchmark_cases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "case_key" VARCHAR(80) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "query" VARCHAR(1000) NOT NULL,
  "language" VARCHAR(12) NOT NULL DEFAULT 'ja',
  "country" VARCHAR(12) NOT NULL DEFAULT 'JP',
  "lookback_days" INTEGER NOT NULL DEFAULT 3,
  "maximum_results" INTEGER NOT NULL DEFAULT 3,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "trend_provider_benchmark_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trend_provider_benchmark_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "trend_provider_benchmark_cases_environment_case_key_key" ON "trend_provider_benchmark_cases"("environment", "case_key");
CREATE INDEX "trend_provider_benchmark_cases_environment_active_created_at_idx" ON "trend_provider_benchmark_cases"("environment", "active", "created_at");

CREATE TABLE "trend_provider_benchmark_observations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "case_id" UUID NOT NULL,
  "provider" "AiProviderKey" NOT NULL,
  "successful" BOOLEAN NOT NULL,
  "evidence" JSONB NOT NULL,
  "cost_usd_micros" INTEGER NOT NULL,
  "latency_ms" INTEGER NOT NULL,
  "relevance_rating" INTEGER NOT NULL,
  "source_quality_rating" INTEGER NOT NULL,
  "notes" VARCHAR(1000),
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "trend_provider_benchmark_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trend_provider_benchmark_observations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "trend_provider_benchmark_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trend_provider_benchmark_observations_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "trend_provider_benchmark_observations_ratings_check" CHECK ("relevance_rating" BETWEEN 0 AND 5 AND "source_quality_rating" BETWEEN 0 AND 5),
  CONSTRAINT "trend_provider_benchmark_observations_metrics_check" CHECK ("cost_usd_micros" >= 0 AND "latency_ms" >= 0)
);
CREATE UNIQUE INDEX "trend_provider_benchmark_observations_case_id_provider_key" ON "trend_provider_benchmark_observations"("case_id", "provider");
CREATE INDEX "trend_provider_benchmark_observations_provider_updated_at_idx" ON "trend_provider_benchmark_observations"("provider", "updated_at");
