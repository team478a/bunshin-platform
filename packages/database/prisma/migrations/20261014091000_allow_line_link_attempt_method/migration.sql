ALTER TABLE "auth_return_attempts"
  DROP CONSTRAINT "auth_return_attempts_identity_check";

ALTER TABLE "auth_return_attempts"
  ADD CONSTRAINT "auth_return_attempts_identity_check" CHECK (
    ("method" = 'EMAIL' AND "login_identity_hash" IS NOT NULL) OR
    ("method" IN ('LINE', 'LINE_LINK') AND "login_identity_hash" IS NULL)
  );
