import type { PrismaClient } from '@prisma/client';

// Provider requests have a 45-second deadline. Allow ample time for persistence
// before treating a process interruption as abandoned generation.
export const FORTUNE_GENERATION_STALE_AFTER_MS = 10 * 60 * 1000;

export type FortuneGenerationRecoverySummary = {
  candidates: number;
  recovered: number;
  failed: number;
};

export async function recoverStaleFortuneReadings(
  db: PrismaClient,
  at: Date,
): Promise<FortuneGenerationRecoverySummary> {
  const cutoff = new Date(at.getTime() - FORTUNE_GENERATION_STALE_AFTER_MS);
  const candidates = await db.fortuneReading.findMany({
    where: { status: 'GENERATING', deletedAt: null, updatedAt: { lte: cutoff } },
    select: {
      id: true,
      workspaceId: true,
      groupId: true,
      serviceSettingId: true,
      participantId: true,
      memberUserId: true,
      updatedAt: true,
      readingText: true,
      actionStep: true,
    },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: 100,
  });
  const summary = { candidates: candidates.length, recovered: 0, failed: 0 };
  for (const reading of candidates) {
    const hasBasicResult = Boolean(reading.readingText?.trim() && reading.actionStep?.trim());
    // Compare-and-set: a concurrent completion, deletion or context update wins.
    // Do not redraw cards, re-run AI, or replace the persisted approved text.
    const result = await db.fortuneReading.updateMany({
      where: {
        id: reading.id,
        workspaceId: reading.workspaceId,
        groupId: reading.groupId,
        serviceSettingId: reading.serviceSettingId,
        participantId: reading.participantId,
        memberUserId: reading.memberUserId,
        status: 'GENERATING',
        deletedAt: null,
        updatedAt: reading.updatedAt,
        readingText: reading.readingText,
        actionStep: reading.actionStep,
      },
      data: {
        status: hasBasicResult ? 'READY_BASIC' : 'FAILED',
        failureCode: hasBasicResult
          ? 'AI_GENERATION_INTERRUPTED'
          : 'AI_GENERATION_INTERRUPTED_MISSING_BASIC',
        modelName: null,
      },
    });
    if (result.count === 1) {
      if (hasBasicResult) summary.recovered += 1;
      else summary.failed += 1;
    }
  }
  return summary;
}
