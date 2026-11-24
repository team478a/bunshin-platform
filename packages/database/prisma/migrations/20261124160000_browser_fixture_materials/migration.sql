CREATE TABLE "browser_fixture_materials" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "goal" VARCHAR(400) NOT NULL,
    "preparation" VARCHAR(400) NOT NULL,
    "practice" VARCHAR(600) NOT NULL,
    "checkpoint" VARCHAR(400) NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "source_job_id" UUID NOT NULL,
    "source_attempt" INTEGER NOT NULL,
    CONSTRAINT "browser_fixture_materials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "browser_fixture_materials_recipe_fkey" FOREIGN KEY ("recipe_id")
      REFERENCES "browser_fixture_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "browser_fixture_materials_recipe_revision_key"
  ON "browser_fixture_materials"("recipe_id", "revision");
ALTER TABLE "browser_fixture_materials" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "browser_fixture_material_steps" (
    "material_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "step_id" VARCHAR(64) NOT NULL,
    "instruction" VARCHAR(400) NOT NULL,
    "before_image" BYTEA NOT NULL,
    "after_image" BYTEA NOT NULL,
    "detail_image" BYTEA,
    CONSTRAINT "browser_fixture_material_steps_pkey" PRIMARY KEY ("material_id", "ordinal"),
    CONSTRAINT "browser_fixture_material_steps_material_fkey" FOREIGN KEY ("material_id")
      REFERENCES "browser_fixture_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "browser_fixture_material_steps_material_step_key"
  ON "browser_fixture_material_steps"("material_id", "step_id");
ALTER TABLE "browser_fixture_material_steps" ENABLE ROW LEVEL SECURITY;
