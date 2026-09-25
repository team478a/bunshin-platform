import { toJapanLocalDate } from '@bunshin/capability-fortune';
import { Prisma, type PrismaClient } from '@prisma/client';
import { dateOnly } from './fortune-shared';

export function fortuneReadingRetentionCutoff(at: Date, historyRetentionDays: number) {
  const cutoff = dateOnly(toJapanLocalDate(at));
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, Math.trunc(historyRetentionDays) - 1));
  return cutoff;
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
