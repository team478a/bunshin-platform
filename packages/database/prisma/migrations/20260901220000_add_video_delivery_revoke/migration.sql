ALTER TYPE "VideoDeliveryStatus" ADD VALUE 'REVOKED';

ALTER TYPE "VideoDeliveryEventType" ADD VALUE 'REVOKED';

ALTER TABLE "video_deliveries"
  ADD COLUMN "revoked_at" TIMESTAMPTZ(6);
