ALTER TABLE "organization_commercial_contracts"
ADD COLUMN "reminder_lead_days" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "overdue_reminder_interval_days" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "organization_commercial_contracts"
ADD CONSTRAINT "organization_commercial_contracts_reminder_lead_days_check"
CHECK ("reminder_lead_days" BETWEEN 0 AND 30),
ADD CONSTRAINT "organization_commercial_contracts_overdue_reminder_interval_days_check"
CHECK ("overdue_reminder_interval_days" BETWEEN 1 AND 30);
