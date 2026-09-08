CREATE TABLE "service_line_link_attempts" (
 "state_hash" CHAR(64) PRIMARY KEY,
 "actor_user_id" UUID NOT NULL,
 "bunshin_id" UUID NOT NULL,
 "configuration_id" UUID NOT NULL,
 "service_slug" VARCHAR(80) NOT NULL,
 "nonce" VARCHAR(64) NOT NULL,
 "verifier" VARCHAR(128) NOT NULL,
 "expires_at" TIMESTAMPTZ(6) NOT NULL,
 "consumed_at" TIMESTAMPTZ(6),
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "service_line_link_attempts_expires_at_idx" ON "service_line_link_attempts"("expires_at");
ALTER TABLE "service_line_link_attempts" ENABLE ROW LEVEL SECURITY;
