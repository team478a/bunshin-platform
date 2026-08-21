CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS', 'PRIVACY');
CREATE TYPE "LegalDocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

CREATE TABLE "legal_documents" (
  "id" UUID NOT NULL,
  "type" "LegalDocumentType" NOT NULL,
  "version" INTEGER NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  "status" "LegalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "effective_at" TIMESTAMPTZ(6),
  "published_at" TIMESTAMPTZ(6),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_documents_type_version_key" ON "legal_documents"("type", "version");
CREATE INDEX "legal_documents_type_status_published_at_idx" ON "legal_documents"("type", "status", "published_at");
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
