CREATE TABLE "line_delivery_retry_requests" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "delivery_id" UUID NOT NULL,
  "delivery_attempt_count" INTEGER NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "job_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "line_delivery_retry_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "line_delivery_retry_requests_attempt_check" CHECK ("delivery_attempt_count" > 0),
  CONSTRAINT "line_delivery_retry_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500)
);

CREATE UNIQUE INDEX "line_delivery_retry_requests_job_id_key" ON "line_delivery_retry_requests"("job_id");
CREATE UNIQUE INDEX "line_delivery_retry_requests_delivery_id_delivery_attempt_count_key" ON "line_delivery_retry_requests"("delivery_id", "delivery_attempt_count");
CREATE INDEX "line_delivery_retry_requests_environment_created_at_idx" ON "line_delivery_retry_requests"("environment", "created_at");
CREATE INDEX "line_delivery_retry_requests_actor_user_id_created_at_idx" ON "line_delivery_retry_requests"("actor_user_id", "created_at");

ALTER TABLE "line_delivery_retry_requests" ADD CONSTRAINT "line_delivery_retry_requests_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "line_message_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "line_delivery_retry_requests" ADD CONSTRAINT "line_delivery_retry_requests_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "line_delivery_retry_requests" ADD CONSTRAINT "line_delivery_retry_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
