ALTER TABLE "social_image_generation_requests" ADD COLUMN "reference_image" JSONB;
ALTER TABLE "social_image_generation_requests" ADD COLUMN "reference_purged_at" TIMESTAMPTZ(6);
