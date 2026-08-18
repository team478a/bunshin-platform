CREATE TYPE "BunshinType" AS ENUM ('COPY', 'EXPERT', 'BRAND', 'CHARACTER');
CREATE TYPE "BunshinStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "ObjectiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "FacePolicy" AS ENUM ('FACE_OK', 'FACE_NG_VOICE_OK', 'FACE_VOICE_NG', 'FULL_ANONYMOUS');

CREATE TABLE "bunshins" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "type" "BunshinType" NOT NULL,
  "status" "BunshinStatus" NOT NULL DEFAULT 'DRAFT',
  "objective_summary" VARCHAR(500) NOT NULL,
  "audience_summary" VARCHAR(500) NOT NULL,
  "personality_summary" VARCHAR(500) NOT NULL,
  "avatar_url" VARCHAR(2048),
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bunshins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bunshin_objectives" (
  "id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "objective_type" VARCHAR(80) NOT NULL,
  "primary_goal" VARCHAR(500) NOT NULL,
  "kpi_name" VARCHAR(160),
  "kpi_target" VARCHAR(160),
  "kpi_period" VARCHAR(160),
  "priority" INTEGER NOT NULL,
  "status" "ObjectiveStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bunshin_objectives_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bunshin_audiences" (
  "id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "age_range" VARCHAR(100),
  "occupation" VARCHAR(160),
  "experience_level" VARCHAR(100),
  "pain_points" JSONB NOT NULL,
  "desires" JSONB NOT NULL,
  "excluded_audience" JSONB NOT NULL,
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bunshin_audiences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bunshin_personalities" (
  "id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "tone" VARCHAR(100) NOT NULL,
  "formality" VARCHAR(100) NOT NULL,
  "energy_level" VARCHAR(100) NOT NULL,
  "expertise_level" VARCHAR(100) NOT NULL,
  "sentence_style" VARCHAR(500) NOT NULL,
  "first_person" VARCHAR(50) NOT NULL,
  "forbidden_expressions" JSONB NOT NULL,
  "preferred_expressions" JSONB NOT NULL,
  "visual_direction" VARCHAR(500),
  "face_policy" "FacePolicy" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bunshin_personalities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bunshins_workspace_id_slug_key" ON "bunshins"("workspace_id", "slug");
CREATE INDEX "bunshins_workspace_id_status_updated_at_idx" ON "bunshins"("workspace_id", "status", "updated_at");
CREATE INDEX "bunshins_owner_user_id_status_idx" ON "bunshins"("owner_user_id", "status");
CREATE UNIQUE INDEX "bunshin_objectives_bunshin_id_priority_key" ON "bunshin_objectives"("bunshin_id", "priority");
CREATE INDEX "bunshin_objectives_bunshin_id_status_idx" ON "bunshin_objectives"("bunshin_id", "status");
CREATE INDEX "bunshin_audiences_bunshin_id_idx" ON "bunshin_audiences"("bunshin_id");
CREATE UNIQUE INDEX "bunshin_personalities_bunshin_id_key" ON "bunshin_personalities"("bunshin_id");

ALTER TABLE "bunshins" ADD CONSTRAINT "bunshins_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bunshins" ADD CONSTRAINT "bunshins_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bunshin_objectives" ADD CONSTRAINT "bunshin_objectives_bunshin_id_fkey" FOREIGN KEY ("bunshin_id") REFERENCES "bunshins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bunshin_audiences" ADD CONSTRAINT "bunshin_audiences_bunshin_id_fkey" FOREIGN KEY ("bunshin_id") REFERENCES "bunshins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bunshin_personalities" ADD CONSTRAINT "bunshin_personalities_bunshin_id_fkey" FOREIGN KEY ("bunshin_id") REFERENCES "bunshins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
