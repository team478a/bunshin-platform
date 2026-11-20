import { toJapanLocalDate } from '@bunshin/capability-fortune';
import { Prisma, type PrismaClient } from '@prisma/client';
import { dateOnly } from './fortune-shared';

export function fortuneReadingRetentionCutoff(at: Date, historyRetentionDays: number) {
  const cutoff = dateOnly(toJapanLocalDate(at));
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, Math.trunc(historyRetentionDays) - 1));
  return cutoff;
}

export async function purgeExpiredFortuneProfiles(db: PrismaClient, at: Date): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE "fortune_participants" AS participant
    SET "profile_interest" = NULL, "profile_question" = NULL,
        "profile_style" = NULL, "profile_consented_at" = NULL
    FROM "fortune_service_settings" AS setting
    WHERE participant."service_setting_id" = setting."id"
      AND participant."profile_consented_at" IS NOT NULL
      AND participant."profile_updated_at" < (
        ${dateOnly(toJapanLocalDate(at))}::timestamptz - GREATEST(setting."history_retention_days" - 1, 0) * INTERVAL '1 day'
      )
  `);
}

export async function purgeExpiredFortuneReadings(db: PrismaClient, at: Date): Promise<number> {
  const today = dateOnly(toJapanLocalDate(at));
  return db.$executeRaw(
    Prisma.sql`
      DELETE FROM "fortune_readings" AS reading
      USING "fortune_service_settings" AS setting
      WHERE reading."service_setting_id" = setting."id"
        AND reading."local_date" < (
          ${today}::date - GREATEST(setting."history_retention_days" - 1, 0)
        )
    `,
  );
}
