ALTER TABLE "social_image_generated_media"
ADD COLUMN "page_index" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "social_image_generated_media_request_id_page_index_key"
ON "social_image_generated_media"("request_id", "page_index");
