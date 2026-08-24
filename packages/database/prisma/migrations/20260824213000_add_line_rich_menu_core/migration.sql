CREATE TYPE "LineRichMenuStatus" AS ENUM ('DRAFT', 'VERIFIED', 'ACTIVE', 'DISABLED', 'ERROR');
CREATE TYPE "LineRichMenuAction" AS ENUM ('OPEN_TODAY', 'OPEN_BUNSHINS', 'OPEN_NOTIFICATION_SETTINGS', 'OPEN_ACCOUNT');

CREATE TABLE "line_rich_menus" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "environment" "LineConfigurationEnvironment" NOT NULL,
  "version" INTEGER NOT NULL, "name" VARCHAR(120) NOT NULL, "description" VARCHAR(500),
  "status" "LineRichMenuStatus" NOT NULL DEFAULT 'DRAFT', "image_object_key" VARCHAR(500) NOT NULL,
  "image_sha256" CHAR(64) NOT NULL, "image_content_type" VARCHAR(40) NOT NULL,
  "image_width" INTEGER NOT NULL, "image_height" INTEGER NOT NULL, "line_rich_menu_id" VARCHAR(128),
  "last_synced_at" TIMESTAMPTZ(6), "last_error_category" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "line_rich_menus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "line_rich_menus_environment_version_key" ON "line_rich_menus"("environment", "version");
CREATE UNIQUE INDEX "line_rich_menus_one_active_per_environment" ON "line_rich_menus"("environment") WHERE "status" = 'ACTIVE';
CREATE INDEX "line_rich_menus_environment_status_created_at_idx" ON "line_rich_menus"("environment", "status", "created_at");

CREATE TABLE "line_rich_menu_areas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "rich_menu_id" UUID NOT NULL,
  "action" "LineRichMenuAction" NOT NULL, "x" INTEGER NOT NULL, "y" INTEGER NOT NULL,
  "width" INTEGER NOT NULL, "height" INTEGER NOT NULL, "sort_order" INTEGER NOT NULL,
  CONSTRAINT "line_rich_menu_areas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "line_rich_menu_areas_rich_menu_id_fkey" FOREIGN KEY ("rich_menu_id") REFERENCES "line_rich_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "line_rich_menu_areas_positive_bounds" CHECK ("x" >= 0 AND "y" >= 0 AND "width" > 0 AND "height" > 0)
);
CREATE UNIQUE INDEX "line_rich_menu_areas_rich_menu_id_action_key" ON "line_rich_menu_areas"("rich_menu_id", "action");
CREATE UNIQUE INDEX "line_rich_menu_areas_rich_menu_id_sort_order_key" ON "line_rich_menu_areas"("rich_menu_id", "sort_order");
CREATE INDEX "line_rich_menu_areas_rich_menu_id_idx" ON "line_rich_menu_areas"("rich_menu_id");

CREATE TABLE "line_rich_menu_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "rich_menu_id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL, "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL, "reason" VARCHAR(500) NOT NULL, "metadata" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "line_rich_menu_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "line_rich_menu_audits_rich_menu_id_fkey" FOREIGN KEY ("rich_menu_id") REFERENCES "line_rich_menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "line_rich_menu_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "line_rich_menu_audits_rich_menu_id_occurred_at_idx" ON "line_rich_menu_audits"("rich_menu_id", "occurred_at");
CREATE INDEX "line_rich_menu_audits_environment_occurred_at_idx" ON "line_rich_menu_audits"("environment", "occurred_at");
CREATE INDEX "line_rich_menu_audits_actor_user_id_occurred_at_idx" ON "line_rich_menu_audits"("actor_user_id", "occurred_at");
