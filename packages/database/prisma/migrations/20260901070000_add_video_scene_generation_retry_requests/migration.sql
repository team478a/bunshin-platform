CREATE TABLE "video_scene_generation_retry_requests" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "video_scene_generation_id" UUID NOT NULL,
  "failed_at_snapshot" TIMESTAMPTZ(6) NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "job_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "video_scene_generation_retry_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_scene_generation_retry_requests_video_scene_generation_id_fkey"
    FOREIGN KEY ("video_scene_generation_id") REFERENCES "video_scene_generations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "video_scene_generation_retry_requests_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "video_scene_generation_retry_requests_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "jobs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "video_scene_generation_retry_requests_job_id_key"
  ON "video_scene_generation_retry_requests"("job_id");
CREATE UNIQUE INDEX "video_scene_generation_retry_requests_generation_failed_at_key"
  ON "video_scene_generation_retry_requests"("video_scene_generation_id", "failed_at_snapshot");
CREATE INDEX "video_scene_generation_retry_requests_environment_created_at_idx"
  ON "video_scene_generation_retry_requests"("environment", "created_at");
CREATE INDEX "video_scene_generation_retry_requests_actor_user_id_created_at_idx"
  ON "video_scene_generation_retry_requests"("actor_user_id", "created_at");
