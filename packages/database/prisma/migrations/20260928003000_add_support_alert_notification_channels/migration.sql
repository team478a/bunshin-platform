ALTER TABLE "service_support_alert_policies"
  ADD COLUMN "notify_by_email" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_by_line" BOOLEAN NOT NULL DEFAULT false;
