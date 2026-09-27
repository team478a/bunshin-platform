ALTER TABLE "fortune_participants"
ADD COLUMN "personalization_bunshin_id" UUID;

CREATE INDEX "fortune_participants_workspace_id_personalization_bunshin_id_idx"
ON "fortune_participants"("workspace_id", "personalization_bunshin_id");

ALTER TABLE "fortune_participants"
ADD CONSTRAINT "fortune_participants_personalization_bunshin_fkey"
FOREIGN KEY ("workspace_id", "personalization_bunshin_id")
REFERENCES "bunshins"("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
