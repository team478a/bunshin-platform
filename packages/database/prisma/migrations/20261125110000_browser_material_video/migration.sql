CREATE TABLE "browser_fixture_material_videos" (
  "material_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "mp4" BYTEA NOT NULL,
  "captions" TEXT NOT NULL,
  "chapters" TEXT NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  CONSTRAINT "browser_fixture_material_videos_pkey" PRIMARY KEY ("material_id", "version"),
  CONSTRAINT "browser_fixture_material_videos_material_fkey" FOREIGN KEY ("material_id")
    REFERENCES "browser_fixture_materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "browser_fixture_material_videos_size_check"
    CHECK (octet_length("mp4") BETWEEN 1 AND 8388608 AND "duration_ms" > 0)
);

ALTER TABLE "browser_fixture_material_videos" ENABLE ROW LEVEL SECURITY;
