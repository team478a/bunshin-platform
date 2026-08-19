CREATE TABLE "content_pillars" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "title" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500),
  "weight" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "content_pillars_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_pillars_weight_check" CHECK ("weight" BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "content_pillars_workspace_id_bunshin_id_title_key" ON "content_pillars"("workspace_id","bunshin_id","title");
CREATE INDEX "content_pillars_workspace_id_bunshin_id_active_deleted_at_created_at_idx" ON "content_pillars"("workspace_id","bunshin_id","active","deleted_at","created_at");

ALTER TABLE "content_pillars" ADD CONSTRAINT "content_pillars_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_pillars" ADD CONSTRAINT "content_pillars_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id","bunshin_id") REFERENCES "bunshins"("workspace_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
