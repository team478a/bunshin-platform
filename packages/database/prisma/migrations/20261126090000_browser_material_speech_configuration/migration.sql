CREATE TABLE "browser_material_speech_configurations" (
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "workspace_id" UUID NOT NULL,
  "region" VARCHAR(40) NOT NULL,
  "encrypted_key" TEXT NOT NULL,
  "key_mask" VARCHAR(12) NOT NULL,
  "shiori_preview" BYTEA,
  "daichi_preview" BYTEA,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "browser_material_speech_configurations_pkey" PRIMARY KEY ("environment"),
  CONSTRAINT "browser_material_speech_workspace_fkey" FOREIGN KEY ("workspace_id")
    REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "browser_material_speech_configurations" ENABLE ROW LEVEL SECURITY;
