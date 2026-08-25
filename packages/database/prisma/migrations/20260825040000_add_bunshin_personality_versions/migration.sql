CREATE TABLE "bunshin_personality_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "bunshin_id" UUID NOT NULL,
    "personality_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "change_reason" VARCHAR(500) NOT NULL,
    "based_on_version_id" UUID,
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
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bunshin_personality_versions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "bunshin_personality_versions" (
    "id", "workspace_id", "bunshin_id", "personality_id", "version", "source",
    "change_reason", "tone", "formality", "energy_level", "expertise_level",
    "sentence_style", "first_person", "forbidden_expressions", "preferred_expressions",
    "visual_direction", "face_policy", "created_by_user_id", "created_at"
)
SELECT
    gen_random_uuid(), b."workspace_id", p."bunshin_id", p."id", 1, 'INITIAL',
    '既存人格から初期版を作成', p."tone", p."formality", p."energy_level", p."expertise_level",
    p."sentence_style", p."first_person", p."forbidden_expressions", p."preferred_expressions",
    p."visual_direction", p."face_policy", b."owner_user_id", p."created_at"
FROM "bunshin_personalities" p
JOIN "bunshins" b ON b."id" = p."bunshin_id";

CREATE UNIQUE INDEX "bunshin_personality_versions_personality_id_version_key"
ON "bunshin_personality_versions"("personality_id", "version");

CREATE UNIQUE INDEX "bunshin_personality_versions_workspace_id_bunshin_id_id_key"
ON "bunshin_personality_versions"("workspace_id", "bunshin_id", "id");

CREATE INDEX "bunshin_personality_versions_workspace_id_bunshin_id_version_idx"
ON "bunshin_personality_versions"("workspace_id", "bunshin_id", "version");

CREATE INDEX "bunshin_personality_versions_created_by_user_id_created_at_idx"
ON "bunshin_personality_versions"("created_by_user_id", "created_at");

ALTER TABLE "bunshin_personality_versions" ADD CONSTRAINT "bunshin_personality_versions_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bunshin_personality_versions" ADD CONSTRAINT "bunshin_personality_versions_workspace_id_bunshin_id_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bunshin_personality_versions" ADD CONSTRAINT "bunshin_personality_versions_personality_id_fkey"
FOREIGN KEY ("personality_id") REFERENCES "bunshin_personalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bunshin_personality_versions" ADD CONSTRAINT "bunshin_personality_versions_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
