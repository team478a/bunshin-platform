CREATE TABLE "video_line_access" (
 "state_hash" CHAR(64) PRIMARY KEY,
 "project_id" UUID NOT NULL,
 "owner_user_id" UUID NOT NULL,
 "configuration_id" UUID NOT NULL,
 "provider_hash" CHAR(64) NOT NULL,
 "nonce" VARCHAR(64) NOT NULL,
 "verifier" VARCHAR(128) NOT NULL,
 "expires_at" TIMESTAMPTZ(6) NOT NULL,
 "consumed_at" TIMESTAMPTZ(6),
 "session_hash" CHAR(64),
 "session_expires_at" TIMESTAMPTZ(6)
);
CREATE UNIQUE INDEX "video_line_access_session_hash_key" ON "video_line_access"("session_hash");
CREATE INDEX "video_line_access_expires_at_session_expires_at_idx" ON "video_line_access"("expires_at", "session_expires_at");
ALTER TABLE "video_line_access" ENABLE ROW LEVEL SECURITY;
