CREATE TYPE "AuthReturnAttemptMethod" AS ENUM ('LINE', 'EMAIL');
CREATE TYPE "AuthReturnAttemptStage" AS ENUM ('PENDING', 'CLAIMED', 'AUTHENTICATED', 'CONSUMED');
CREATE TABLE "auth_return_attempts" (
  "id" UUID PRIMARY KEY,
  "proof_hash" CHAR(64) NOT NULL,
  "method" "AuthReturnAttemptMethod" NOT NULL,
  "stage" "AuthReturnAttemptStage" NOT NULL DEFAULT 'PENDING',
  "origin" VARCHAR(255) NOT NULL,
  "return_path" VARCHAR(2048),
  "pkce_flow_id" VARCHAR(64),
  "login_identity_hash" CHAR(64),
  "actor_user_id" UUID,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_return_attempts_identity_check" CHECK (
    ("method" = 'EMAIL' AND "login_identity_hash" IS NOT NULL) OR
    ("method" = 'LINE' AND "login_identity_hash" IS NULL)
  ),
  CONSTRAINT "auth_return_attempts_actor_check" CHECK (
    "stage" != 'AUTHENTICATED' OR "actor_user_id" IS NOT NULL
  ),
  CONSTRAINT "auth_return_attempts_expiry_check" CHECK ("expires_at" > "created_at")
);
CREATE INDEX "auth_return_attempts_expires_at_idx" ON "auth_return_attempts"("expires_at");
ALTER TABLE "auth_return_attempts" ENABLE ROW LEVEL SECURITY;
