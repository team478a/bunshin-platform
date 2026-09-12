ALTER TABLE "service_line_broadcasts"
ADD COLUMN "automation_key" VARCHAR(200);

ALTER TABLE "service_line_broadcast_recipients"
ADD COLUMN "message" TEXT;

CREATE UNIQUE INDEX "service_line_broadcasts_automation_key_key"
ON "service_line_broadcasts"("automation_key");
