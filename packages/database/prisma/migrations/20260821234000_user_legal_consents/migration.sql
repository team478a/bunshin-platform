CREATE TABLE "user_legal_consents" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "legal_document_id" UUID NOT NULL,
  "consented_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_legal_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_legal_consents_user_id_legal_document_id_key" ON "user_legal_consents"("user_id", "legal_document_id");
CREATE INDEX "user_legal_consents_user_id_consented_at_idx" ON "user_legal_consents"("user_id", "consented_at");
CREATE INDEX "user_legal_consents_legal_document_id_consented_at_idx" ON "user_legal_consents"("legal_document_id", "consented_at");
ALTER TABLE "user_legal_consents" ADD CONSTRAINT "user_legal_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_legal_consents" ADD CONSTRAINT "user_legal_consents_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
