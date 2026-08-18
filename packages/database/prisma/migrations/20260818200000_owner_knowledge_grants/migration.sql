CREATE TYPE "OwnerKnowledgeType" AS ENUM ('PROFILE','EXPERIENCE','SKILL','PRODUCT','FAQ','CASE','ASSET','OTHER');
CREATE TYPE "KnowledgeSourceType" AS ENUM ('MANUAL','IMPORT','SYSTEM');
CREATE TYPE "OwnerKnowledgeStatus" AS ENUM ('ACTIVE','ARCHIVED');
CREATE TYPE "KnowledgeGrantStatus" AS ENUM ('ACTIVE','REVOKED');

CREATE TABLE "owner_knowledge" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL, "type" "OwnerKnowledgeType" NOT NULL,
  "title" VARCHAR(160) NOT NULL, "content" VARCHAR(20000) NOT NULL,
  "source_type" "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
  "status" "OwnerKnowledgeStatus" NOT NULL DEFAULT 'ACTIVE', "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "owner_knowledge_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "bunshin_knowledge_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL, "owner_knowledge_id" UUID NOT NULL, "granted_by_user_id" UUID NOT NULL,
  "status" "KnowledgeGrantStatus" NOT NULL DEFAULT 'ACTIVE',
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "bunshin_knowledge_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "owner_knowledge_workspace_id_owner_user_id_status_updated_at_idx" ON "owner_knowledge"("workspace_id","owner_user_id","status","updated_at");
CREATE UNIQUE INDEX "bunshin_knowledge_grants_workspace_id_bunshin_id_owner_knowledge_id_key" ON "bunshin_knowledge_grants"("workspace_id","bunshin_id","owner_knowledge_id");
CREATE INDEX "bunshin_knowledge_grants_bunshin_id_status_idx" ON "bunshin_knowledge_grants"("bunshin_id","status");
CREATE INDEX "bunshin_knowledge_grants_owner_knowledge_id_status_idx" ON "bunshin_knowledge_grants"("owner_knowledge_id","status");
ALTER TABLE "owner_knowledge" ADD CONSTRAINT "owner_knowledge_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_knowledge" ADD CONSTRAINT "owner_knowledge_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bunshin_knowledge_grants" ADD CONSTRAINT "bunshin_knowledge_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bunshin_knowledge_grants" ADD CONSTRAINT "bunshin_knowledge_grants_bunshin_id_fkey" FOREIGN KEY ("bunshin_id") REFERENCES "bunshins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bunshin_knowledge_grants" ADD CONSTRAINT "bunshin_knowledge_grants_owner_knowledge_id_fkey" FOREIGN KEY ("owner_knowledge_id") REFERENCES "owner_knowledge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bunshin_knowledge_grants" ADD CONSTRAINT "bunshin_knowledge_grants_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
