import { inferSocialActivityBarriers } from '@bunshin/capability-social';
import type { SocialActivityBarrierCategory } from '@bunshin/capability-social';
import type { PrismaClient } from '@prisma/client';
import { PrismaSocialActivityBarrierObservationRepository } from './social-activity-barrier-repository';

const DAY = 24 * 60 * 60 * 1_000;
export const SOCIAL_ACTIVITY_BARRIER_RESOLUTION_MINIMUM_DAYS = 14;
export const SOCIAL_ACTIVITY_BARRIER_RESOLUTION_COOLDOWN_DAYS = 30;

export type SocialActivityBarrierResolutionSummary = {
  scanned: number;
  resolved: number;
  persistent: number;
  skipped: number;
  failures: number;
  truncated: boolean;
};

export function shouldResolveSocialActivityBarrier(input: {
  category: SocialActivityBarrierCategory;
  observation: Parameters<typeof inferSocialActivityBarriers>[0];
}) {
  if (
    input.observation.observationWindow.eligibleDays <
      SOCIAL_ACTIVITY_BARRIER_RESOLUTION_MINIMUM_DAYS ||
    input.observation.observationWindow.excludedSystemIncidentDays > 0
  )
    return false;
  return !inferSocialActivityBarriers(input.observation).some(
    (candidate) => candidate.category === input.category,
  );
}

export async function resolveImprovedSocialActivityBarriers(
  client: PrismaClient,
  input: { at?: Date; limit?: number } = {},
): Promise<SocialActivityBarrierResolutionSummary> {
  const at = input.at ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
  const rows = await client.socialActivitySupportIntervention.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { not: null, lte: new Date(at.getTime() - 14 * DAY) },
      oemSupportCandidate: null,
      barrierCase: {
        status: 'CONFIRMED',
        groupMembership: { status: 'ACTIVE', user: { status: 'ACTIVE' } },
        bunshin: { status: 'ACTIVE' },
      },
    },
    select: {
      completedAt: true,
      barrierCase: {
        select: {
          id: true,
          workspaceId: true,
          groupId: true,
          groupMembershipId: true,
          userId: true,
          bunshinId: true,
          category: true,
        },
      },
    },
    orderBy: [{ completedAt: 'asc' }],
    take: limit + 1,
  });
  const summary: SocialActivityBarrierResolutionSummary = {
    scanned: Math.min(rows.length, limit),
    resolved: 0,
    persistent: 0,
    skipped: 0,
    failures: 0,
    truncated: rows.length > limit,
  };
  const observations = new PrismaSocialActivityBarrierObservationRepository(client);
  for (const row of rows.slice(0, limit)) {
    try {
      if (!row.completedAt) {
        summary.skipped += 1;
        continue;
      }
      const observation = await observations.collect({
        scope: {
          workspaceId: row.barrierCase.workspaceId,
          serviceId: row.barrierCase.groupId,
          groupMembershipId: row.barrierCase.groupMembershipId,
          userId: row.barrierCase.userId,
          bunshinId: row.barrierCase.bunshinId,
        },
        from: row.completedAt,
        to: at,
      });
      if (!observation) {
        summary.skipped += 1;
        continue;
      }
      if (
        !shouldResolveSocialActivityBarrier({ category: row.barrierCase.category, observation })
      ) {
        if (
          observation.observationWindow.eligibleDays >=
            SOCIAL_ACTIVITY_BARRIER_RESOLUTION_MINIMUM_DAYS &&
          observation.observationWindow.excludedSystemIncidentDays === 0
        )
          summary.persistent += 1;
        else summary.skipped += 1;
        continue;
      }
      const updated = await client.socialActivityBarrierCase.updateMany({
        where: { id: row.barrierCase.id, status: 'CONFIRMED' },
        data: {
          status: 'RESOLVED',
          resolvedAt: at,
          nextEligibleAt: new Date(
            at.getTime() + SOCIAL_ACTIVITY_BARRIER_RESOLUTION_COOLDOWN_DAYS * DAY,
          ),
        },
      });
      if (updated.count === 1) summary.resolved += 1;
      else summary.skipped += 1;
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}
