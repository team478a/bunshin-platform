-- Keep all old, short-lived attempts. No backfill or credential changes.
-- null identifies a service-member learning connection; authorization remains server-side.
ALTER TABLE "service_line_link_attempts" ALTER COLUMN "bunshin_id" DROP NOT NULL;
