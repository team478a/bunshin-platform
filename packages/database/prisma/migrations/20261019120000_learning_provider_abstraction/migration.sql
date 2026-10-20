ALTER TYPE "AiProviderKey" ADD VALUE IF NOT EXISTS 'GOOGLE';

ALTER TABLE "ai_provider_configurations"
  ADD COLUMN "model_capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve current OpenAI learning behavior after capabilities become explicit.
UPDATE "ai_provider_configurations"
SET "model_capabilities" = ARRAY['STRUCTURED_OUTPUT', 'IMAGE_INPUT', 'LONG_CONTEXT']::TEXT[]
WHERE "provider" = 'OPENAI' AND "model" IS NOT NULL;
