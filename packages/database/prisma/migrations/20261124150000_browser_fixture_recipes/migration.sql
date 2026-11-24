CREATE TABLE "browser_fixture_recipes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "fixture_version" VARCHAR(64) NOT NULL,
    "device" VARCHAR(12) NOT NULL,
    "plan_hash" CHAR(64) NOT NULL,
    "plan" JSONB NOT NULL,
    "source_job_id" UUID NOT NULL,
    "source_attempt" INTEGER NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "browser_fixture_recipes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "browser_fixture_recipes_active_device" CHECK ("device" IN ('desktop', 'mobile')),
    CONSTRAINT "browser_fixture_recipes_attempt_positive" CHECK ("source_attempt" > 0),
    CONSTRAINT "browser_fixture_recipes_membership_fkey" FOREIGN KEY ("workspace_id", "actor_id")
      REFERENCES "workspace_memberships"("workspace_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "browser_fixture_recipes_content_key"
  ON "browser_fixture_recipes"("workspace_id", "actor_id", "fixture_version", "device", "plan_hash");

ALTER TABLE "browser_fixture_recipes" ENABLE ROW LEVEL SECURITY;
