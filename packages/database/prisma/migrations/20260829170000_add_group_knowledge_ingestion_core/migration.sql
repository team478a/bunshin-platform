CREATE TYPE "GroupKnowledgeSourceType" AS ENUM ('PDF', 'VIDEO', 'URL', 'TEXT');
CREATE TYPE "GroupKnowledgeSourceStatus" AS ENUM ('DRAFT', 'PROCESSING', 'REVIEW_REQUIRED', 'ACTIVE', 'FAILED', 'ARCHIVED');
CREATE TYPE "GroupKnowledgeChunkType" AS ENUM ('GENERAL', 'FACT', 'FAQ', 'RULE');
CREATE TYPE "GroupKnowledgeAuditAction" AS ENUM ('CREATED', 'PROCESSING_STARTED', 'EXTRACTION_SAVED', 'FAILED', 'APPROVED', 'ARCHIVED');

CREATE TABLE "group_knowledge_sources" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "product_pack_version_id" UUID,
  "logical_key" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL,
  "type" "GroupKnowledgeSourceType" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "source_uri" VARCHAR(2048),
  "storage_key" VARCHAR(1000),
  "original_file_name" VARCHAR(255),
  "mime_type" VARCHAR(120),
  "content_hash" CHAR(64),
  "status" "GroupKnowledgeSourceStatus" NOT NULL DEFAULT 'DRAFT',
  "failure_code" VARCHAR(100),
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "group_knowledge_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_knowledge_chunks" (
  "id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "type" "GroupKnowledgeChunkType" NOT NULL DEFAULT 'GENERAL',
  "content" VARCHAR(8000) NOT NULL,
  "source_label" VARCHAR(300) NOT NULL,
  "page_number" INTEGER,
  "start_seconds" INTEGER,
  "end_seconds" INTEGER,
  "confidence" DECIMAL(4,3),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_knowledge_audit_logs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" "GroupKnowledgeAuditAction" NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_knowledge_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_knowledge_sources_workspace_id_group_id_logical_key_version_key" ON "group_knowledge_sources"("workspace_id", "group_id", "logical_key", "version");
CREATE INDEX "group_knowledge_sources_workspace_id_group_id_status_updated_at_idx" ON "group_knowledge_sources"("workspace_id", "group_id", "status", "updated_at");
CREATE INDEX "group_knowledge_sources_product_pack_version_id_status_idx" ON "group_knowledge_sources"("product_pack_version_id", "status");
CREATE INDEX "group_knowledge_sources_content_hash_idx" ON "group_knowledge_sources"("content_hash");
CREATE UNIQUE INDEX "group_knowledge_chunks_source_id_sort_order_key" ON "group_knowledge_chunks"("source_id", "sort_order");
CREATE INDEX "group_knowledge_chunks_source_id_type_idx" ON "group_knowledge_chunks"("source_id", "type");
CREATE INDEX "group_knowledge_audit_logs_workspace_id_group_id_created_at_idx" ON "group_knowledge_audit_logs"("workspace_id", "group_id", "created_at");
CREATE INDEX "group_knowledge_audit_logs_source_id_created_at_idx" ON "group_knowledge_audit_logs"("source_id", "created_at");

ALTER TABLE "group_knowledge_sources" ADD CONSTRAINT "group_knowledge_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_knowledge_sources" ADD CONSTRAINT "group_knowledge_sources_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_knowledge_sources" ADD CONSTRAINT "group_knowledge_sources_product_pack_version_id_fkey" FOREIGN KEY ("product_pack_version_id") REFERENCES "product_pack_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_knowledge_sources" ADD CONSTRAINT "group_knowledge_sources_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_knowledge_sources" ADD CONSTRAINT "group_knowledge_sources_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_knowledge_chunks" ADD CONSTRAINT "group_knowledge_chunks_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "group_knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_knowledge_audit_logs" ADD CONSTRAINT "group_knowledge_audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_knowledge_audit_logs" ADD CONSTRAINT "group_knowledge_audit_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_knowledge_audit_logs" ADD CONSTRAINT "group_knowledge_audit_logs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "group_knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_knowledge_audit_logs" ADD CONSTRAINT "group_knowledge_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
