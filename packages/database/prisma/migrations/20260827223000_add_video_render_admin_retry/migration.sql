CREATE TABLE "video_render_retry_requests" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "video_render_id" UUID NOT NULL,
  "failed_at_snapshot" TIMESTAMPTZ(6) NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "job_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "video_render_retry_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_render_retry_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500)
);

CREATE UNIQUE INDEX "video_render_retry_requests_job_id_key" ON "video_render_retry_requests"("job_id");
CREATE UNIQUE INDEX "video_render_retry_requests_render_failed_at_key" ON "video_render_retry_requests"("video_render_id", "failed_at_snapshot");
CREATE INDEX "video_render_retry_requests_environment_created_at_idx" ON "video_render_retry_requests"("environment", "created_at");
CREATE INDEX "video_render_retry_requests_actor_created_at_idx" ON "video_render_retry_requests"("actor_user_id", "created_at");

ALTER TABLE "video_render_retry_requests" ADD CONSTRAINT "video_render_retry_requests_video_render_id_fkey" FOREIGN KEY ("video_render_id") REFERENCES "video_renders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_render_retry_requests" ADD CONSTRAINT "video_render_retry_requests_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_render_retry_requests" ADD CONSTRAINT "video_render_retry_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
