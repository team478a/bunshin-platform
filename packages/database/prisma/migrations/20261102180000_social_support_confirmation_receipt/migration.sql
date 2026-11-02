-- Request provenance cannot be reconstructed for earlier confirmations.
ALTER TABLE "social_activity_barrier_confirmations"
  ADD COLUMN "request_snapshot" JSONB,
  ADD CONSTRAINT "social_support_request_snapshot_check"
    CHECK ("request_snapshot" IS NULL OR jsonb_typeof("request_snapshot") = 'object');
