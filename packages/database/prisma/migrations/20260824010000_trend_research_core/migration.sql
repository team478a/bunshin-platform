CREATE TYPE "TrendResearchRunStatus" AS ENUM ('COMPLETED', 'FAILED', 'EXPIRED');
CREATE TYPE "TrendEvidenceSourceType" AS ENUM ('OFFICIAL_API', 'PUBLIC_WEB', 'NEWS', 'OTHER');
CREATE TYPE "TrendEvidenceStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REJECTED');
CREATE TYPE "TrendIdeaCandidateStatus" AS ENUM ('PROPOSED', 'SELECTED', 'REJECTED', 'EXPIRED');
CREATE TYPE "TrendSafetyStatus" AS ENUM ('SAFE', 'REVIEW_REQUIRED', 'REJECTED');

CREATE TABLE "trend_research_runs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "social_profile_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "status" "TrendResearchRunStatus" NOT NULL DEFAULT 'COMPLETED',
  "query_version" VARCHAR(120) NOT NULL,
  "provider_key" VARCHAR(40) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "failure_category" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "trend_research_runs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "trend_evidence" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "research_run_id" UUID NOT NULL,
  "source_type" "TrendEvidenceSourceType" NOT NULL,
  "source_url" VARCHAR(2048) NOT NULL,
  "source_title" VARCHAR(500) NOT NULL,
  "published_at" TIMESTAMPTZ(6),
  "retrieved_at" TIMESTAMPTZ(6) NOT NULL,
  "summary" VARCHAR(2000) NOT NULL,
  "evidence_hash" VARCHAR(64) NOT NULL,
  "status" "TrendEvidenceStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trend_evidence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "trend_idea_candidates" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "social_profile_id" UUID NOT NULL,
  "research_run_id" UUID NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "topic" VARCHAR(200) NOT NULL,
  "hook" VARCHAR(500) NOT NULL,
  "why_now" VARCHAR(1000) NOT NULL,
  "fit_reason" VARCHAR(1000) NOT NULL,
  "suggested_format" "SocialPreferredFormat" NOT NULL,
  "estimated_minutes" INTEGER NOT NULL,
  "freshness_score" INTEGER NOT NULL,
  "fit_score" INTEGER NOT NULL,
  "feasibility_score" INTEGER NOT NULL,
  "safety_status" "TrendSafetyStatus" NOT NULL,
  "status" "TrendIdeaCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "trend_idea_candidates_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "trend_idea_candidate_evidence" (
  "candidate_id" UUID NOT NULL,
  "evidence_id" UUID NOT NULL,
  CONSTRAINT "trend_idea_candidate_evidence_pkey" PRIMARY KEY ("candidate_id", "evidence_id")
);

CREATE UNIQUE INDEX "trend_research_runs_workspace_id_bunshin_id_social_profile_id_period_start_query_version_key" ON "trend_research_runs"("workspace_id", "bunshin_id", "social_profile_id", "period_start", "query_version");
CREATE UNIQUE INDEX "trend_research_runs_workspace_id_bunshin_id_id_key" ON "trend_research_runs"("workspace_id", "bunshin_id", "id");
CREATE INDEX "trend_research_runs_workspace_id_bunshin_id_status_expires_at_idx" ON "trend_research_runs"("workspace_id", "bunshin_id", "status", "expires_at");
CREATE UNIQUE INDEX "trend_evidence_research_run_id_evidence_hash_key" ON "trend_evidence"("research_run_id", "evidence_hash");
CREATE UNIQUE INDEX "trend_evidence_workspace_id_bunshin_id_id_key" ON "trend_evidence"("workspace_id", "bunshin_id", "id");
CREATE INDEX "trend_evidence_workspace_id_bunshin_id_status_expires_at_idx" ON "trend_evidence"("workspace_id", "bunshin_id", "status", "expires_at");
CREATE UNIQUE INDEX "trend_idea_candidates_workspace_id_bunshin_id_id_key" ON "trend_idea_candidates"("workspace_id", "bunshin_id", "id");
CREATE INDEX "trend_idea_candidates_workspace_id_bunshin_id_social_profile_id_status_expires_at_idx" ON "trend_idea_candidates"("workspace_id", "bunshin_id", "social_profile_id", "status", "expires_at");
CREATE INDEX "trend_idea_candidate_evidence_evidence_id_idx" ON "trend_idea_candidate_evidence"("evidence_id");

ALTER TABLE "trend_research_runs" ADD CONSTRAINT "trend_research_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_research_runs" ADD CONSTRAINT "trend_research_runs_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_research_runs" ADD CONSTRAINT "trend_research_runs_workspace_id_bunshin_id_social_profile_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "social_profile_id") REFERENCES "social_profiles"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_evidence" ADD CONSTRAINT "trend_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_evidence" ADD CONSTRAINT "trend_evidence_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_evidence" ADD CONSTRAINT "trend_evidence_workspace_id_bunshin_id_research_run_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "research_run_id") REFERENCES "trend_research_runs"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_idea_candidates" ADD CONSTRAINT "trend_idea_candidates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_idea_candidates" ADD CONSTRAINT "trend_idea_candidates_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_idea_candidates" ADD CONSTRAINT "trend_idea_candidates_workspace_id_bunshin_id_social_profile_id_platform_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "social_profile_id", "platform") REFERENCES "social_profiles"("workspace_id", "bunshin_id", "id", "platform") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_idea_candidates" ADD CONSTRAINT "trend_idea_candidates_workspace_id_bunshin_id_research_run_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "research_run_id") REFERENCES "trend_research_runs"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trend_idea_candidate_evidence" ADD CONSTRAINT "trend_idea_candidate_evidence_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "trend_idea_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trend_idea_candidate_evidence" ADD CONSTRAINT "trend_idea_candidate_evidence_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "trend_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
