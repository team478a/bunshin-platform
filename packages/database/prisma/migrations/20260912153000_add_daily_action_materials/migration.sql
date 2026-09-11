CREATE TYPE "BunshinMemoryAttachmentStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'REJECTED');

ALTER TABLE "bunshin_memories"
  ADD COLUMN "attachment_status" "BunshinMemoryAttachmentStatus",
  ADD COLUMN "attachment_storage_key" VARCHAR(512),
  ADD COLUMN "attachment_mime_type" VARCHAR(100),
  ADD COLUMN "attachment_size_bytes" INTEGER,
  ADD COLUMN "attachment_width" INTEGER,
  ADD COLUMN "attachment_height" INTEGER;

CREATE UNIQUE INDEX "bunshin_memories_attachment_storage_key_key"
  ON "bunshin_memories"("attachment_storage_key");

CREATE INDEX "bunshin_memories_workspace_id_bunshin_id_source_type_source_id_idx"
  ON "bunshin_memories"("workspace_id", "bunshin_id", "source_type", "source_id");
