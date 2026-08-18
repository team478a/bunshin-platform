CREATE TYPE "BunshinMemoryType" AS ENUM ('BELIEF','EXPERIENCE','KNOWLEDGE','STORY','FAQ','OPINION','PREFERENCE','PERFORMANCE_INSIGHT');
CREATE TYPE "BunshinMemorySourceType" AS ENUM ('USER_INPUT','MISSION_FEEDBACK','PERFORMANCE','IMPORT','SYSTEM');
CREATE TABLE "bunshin_memories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL, "type" "BunshinMemoryType" NOT NULL,
  "content" VARCHAR(20000) NOT NULL, "summary" VARCHAR(1000),
  "source_type" "BunshinMemorySourceType" NOT NULL DEFAULT 'USER_INPUT', "source_id" VARCHAR(255),
  "confidence" DECIMAL(4,3) NOT NULL, "importance" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bunshin_memories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bunshin_memories_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "bunshin_memories_importance_check" CHECK ("importance" >= 1 AND "importance" <= 5)
);
CREATE INDEX "bunshin_memories_workspace_id_bunshin_id_active_deleted_at_updated_at_idx" ON "bunshin_memories"("workspace_id","bunshin_id","active","deleted_at","updated_at");
ALTER TABLE "bunshin_memories" ADD CONSTRAINT "bunshin_memories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bunshin_memories" ADD CONSTRAINT "bunshin_memories_bunshin_id_fkey" FOREIGN KEY ("bunshin_id") REFERENCES "bunshins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
