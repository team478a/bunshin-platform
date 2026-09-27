import { selectSocialActivityOemSupportRecommendation } from '@bunshin/capability-social';
import type { PrismaClient } from '@prisma/client';

export type SocialActivityOemSupportCandidateProjectionSummary = {
  scanned: number;
  created: number;
  skipped: number;
  failures: number;
  truncated: boolean;
};

export async function projectSocialActivityOemSupportCandidates(
  client: PrismaClient,
  input: { limit?: number; detectedAt?: Date } = {},
): Promise<SocialActivityOemSupportCandidateProjectionSummary> {
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
  const detectedAt = input.detectedAt ?? new Date();
  const rows = await client.socialActivitySupportIntervention.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { not: null, lt: detectedAt },
      oemSupportCandidate: null,
      barrierCase: {
        status: 'CONFIRMED',
        groupMembership: { status: 'ACTIVE', user: { status: 'ACTIVE' } },
        bunshin: { status: 'ACTIVE' },
      },
    },
    select: {
      id: true,
      completedAt: true,
      barrierCase: {
        select: {
          id: true,
          category: true,
          groupMembership: {
            select: {
              group: {
                select: {
                  serviceConfiguration: {
                    select: { supportAlertPolicy: { select: { mode: true } } },
                  },
                },
              },
            },
          },
          evidenceSnapshots: {
            where: { detectedAt: { lt: detectedAt } },
            orderBy: { detectedAt: 'desc' },
            select: {
              id: true,
              observationFrom: true,
              observationTo: true,
              eligibleDays: true,
              excludedSystemIncidentDays: true,
            },
          },
        },
      },
    },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });
  const summary: SocialActivityOemSupportCandidateProjectionSummary = {
    scanned: Math.min(rows.length, limit),
    created: 0,
    skipped: 0,
    failures: 0,
    truncated: rows.length > limit,
  };

  for (const row of rows.slice(0, limit)) {
    const completedAt = row.completedAt;
    const handlingMode =
      row.barrierCase.groupMembership.group.serviceConfiguration?.supportAlertPolicy?.mode ??
      'INTERNAL_ESCALATION';
    if (!completedAt || handlingMode === 'DISABLED') {
      summary.skipped += 1;
      continue;
    }
    const selected = row.barrierCase.evidenceSnapshots
      .map((evidence) => ({
        evidence,
        recommendation: selectSocialActivityOemSupportRecommendation({
          category: row.barrierCase.category,
          supportCompletedAt: completedAt,
          observationFrom: evidence.observationFrom,
          observationTo: evidence.observationTo,
          eligibleDays: evidence.eligibleDays,
          excludedSystemIncidentDays: evidence.excludedSystemIncidentDays,
        }),
      }))
      .find((item) => item.recommendation !== null);
    if (!selected?.recommendation) {
      summary.skipped += 1;
      continue;
    }
    try {
      await client.socialActivityOemSupportCandidate.upsert({
        where: { supportInterventionId: row.id },
        update: {},
        create: {
          caseId: row.barrierCase.id,
          supportInterventionId: row.id,
          evidenceId: selected.evidence.id,
          recommendationKey: selected.recommendation.key,
          recommendationSnapshot: {
            title: selected.recommendation.title,
            description: selected.recommendation.description,
            handlingMode,
          },
          reasonCode: selected.recommendation.reasonCode,
          ruleVersion: selected.recommendation.ruleVersion,
          detectedAt,
        },
      });
      summary.created += 1;
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}
