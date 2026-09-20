-- Program-based capabilities such as AI training may evaluate a member without a Bunshin.
ALTER TABLE "ai_usage_events"
  ALTER COLUMN "bunshin_id" DROP NOT NULL;
