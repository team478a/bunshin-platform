import { toJapanLocalDate } from '@bunshin/capability-fortune';
import { Prisma, type PrismaClient } from '@prisma/client';
import { dateOnly } from './fortune-shared';

export const clearFortuneUnderstanding = {
  understandingItems: Prisma.DbNull,
  understandingRevision: null,
  understandingSavedAt: null,
  understandingExpiresAt: null,
};

export function fortuneReadingRetentionCutoff(at: Date, historyRetentionDays: number) {
  const cutoff = dateOnly(toJapanLocalDate(at));
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, Math.trunc(historyRetentionDays) - 1));
  return cutoff;
}

export async function purgeExpiredFortuneIntake(db: PrismaClient, at: Date) {
  return db.fortuneIntakeTurn.deleteMany({
    where: { localDate: { lt: dateOnly(toJapanLocalDate(at)) } },
  });
}

export async function purgeExpiredFortuneProfiles(db: PrismaClient, at: Date): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    WITH expired AS (
      SELECT participant."id" FROM "fortune_participants" AS participant
      JOIN "fortune_service_settings" AS setting ON participant."service_setting_id" = setting."id"
      WHERE participant."profile_consented_at" IS NOT NULL
        AND participant."profile_updated_at" < (
          ${dateOnly(toJapanLocalDate(at))}::timestamptz - GREATEST(setting."history_retention_days" - 1, 0) * INTERVAL '1 day'
        )
      FOR UPDATE OF participant
    ), erased AS (
      UPDATE "fortune_reading_follow_ups" AS follow_up
      SET "status" = 'ERASED', "question" = NULL, "answer" = NULL, "action_step" = NULL
      FROM "fortune_readings" AS reading, expired
      WHERE follow_up."reading_id" = reading."id"
        AND reading."participant_id" = expired."id" AND follow_up."status" <> 'ERASED'
    )
    UPDATE "fortune_participants" AS participant
    SET "profile_interest" = NULL, "profile_question" = NULL,
        "profile_style" = NULL, "profile_consented_at" = NULL,
        "understanding_items" = NULL, "understanding_revision" = NULL,
        "understanding_saved_at" = NULL, "understanding_expires_at" = NULL
    FROM expired WHERE participant."id" = expired."id"
  `);
}

export async function purgeExpiredFortuneUnderstanding(db: PrismaClient, at: Date) {
  return db.$executeRaw`
    UPDATE "fortune_participants" AS participant
    SET "understanding_items" = NULL, "understanding_revision" = gen_random_uuid(),
        "understanding_saved_at" = NULL, "understanding_expires_at" = NULL
    FROM "fortune_service_settings" AS setting
    WHERE setting."id" = participant."service_setting_id"
      AND participant."understanding_expires_at" IS NOT NULL
      AND (
        participant."understanding_expires_at" <= ${at}
        OR participant."profile_updated_at" + setting."history_retention_days" * INTERVAL '24 hours' <= ${at}
      )
  `;
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
