ALTER TYPE "GroupMembershipStatus" ADD VALUE 'PENDING_APPROVAL' AFTER 'INVITED';
ALTER TYPE "GroupMembershipAuditAction" ADD VALUE 'REQUESTED' BEFORE 'ROLE_CHANGED';
ALTER TYPE "GroupMembershipAuditAction" ADD VALUE 'APPROVED' BEFORE 'ROLE_CHANGED';

CREATE TABLE "service_legal_documents" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "configuration_id" UUID NOT NULL,
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
    CONSTRAINT "service_legal_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_legal_consents" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "legal_document_id" UUID NOT NULL,
    "consented_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_legal_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_legal_documents_group_id_type_version_key" ON "service_legal_documents"("group_id", "type", "version");
CREATE UNIQUE INDEX "service_legal_documents_workspace_id_group_id_id_key" ON "service_legal_documents"("workspace_id", "group_id", "id");
CREATE INDEX "service_legal_documents_workspace_id_group_id_type_status_published_at_idx" ON "service_legal_documents"("workspace_id", "group_id", "type", "status", "published_at");
CREATE UNIQUE INDEX "service_legal_consents_group_membership_id_legal_document_id_key" ON "service_legal_consents"("group_membership_id", "legal_document_id");
CREATE INDEX "service_legal_consents_workspace_id_group_id_user_id_consented_at_idx" ON "service_legal_consents"("workspace_id", "group_id", "user_id", "consented_at");

ALTER TABLE "service_legal_documents" ADD CONSTRAINT "service_legal_documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_legal_documents" ADD CONSTRAINT "service_legal_documents_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_legal_documents" ADD CONSTRAINT "service_legal_documents_workspace_id_group_id_configuration_id_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_legal_documents" ADD CONSTRAINT "service_legal_documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_legal_consents" ADD CONSTRAINT "service_legal_consents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_legal_consents" ADD CONSTRAINT "service_legal_consents_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_legal_consents" ADD CONSTRAINT "service_legal_consents_workspace_id_group_id_group_membership_id_user_id_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_legal_consents" ADD CONSTRAINT "service_legal_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_legal_consents" ADD CONSTRAINT "service_legal_consents_workspace_id_group_id_legal_document_id_fkey" FOREIGN KEY ("workspace_id", "group_id", "legal_document_id") REFERENCES "service_legal_documents"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
