import type { Prisma } from '@prisma/client';
import type { CommonBadgeCandidate } from '@bunshin/application';

export async function badgeSourceMatches(
  tx: Prisma.TransactionClient,
  input: CommonBadgeCandidate,
): Promise<boolean> {
  const base = { id: input.sourceEventId, workspaceId: input.workspaceId };
  if (input.eventType === 'BUNSHIN_CREATED')
    return Boolean(
      await tx.bunshin.findFirst({
        where: { ...base, id: input.sourceBunshinId ?? '', ownerUserId: input.userId },
        select: { id: true },
      }),
    );
  if (input.eventType === 'STRATEGY_APPROVED')
    return Boolean(
      await tx.socialAccountStrategy.findFirst({
        where: {
          ...base,
          bunshinId: input.sourceBunshinId ?? '',
          status: 'APPROVED',
          bunshin: { ownerUserId: input.userId },
        },
        select: { id: true },
      }),
    );
  if (input.eventType === 'MISSION_VIEWED')
    return Boolean(
      await tx.missionActivity.findFirst({
        where: {
          ...base,
          bunshinId: input.sourceBunshinId ?? '',
          actorUserId: input.userId,
          type: 'VIEWED',
        },
        select: { id: true },
      }),
    );
  if (input.eventType === 'MISSION_ACCEPTED')
    return Boolean(
      await tx.missionDecision.findFirst({
        where: {
          ...base,
          bunshinId: input.sourceBunshinId ?? '',
          decision: 'ACCEPTED',
          bunshin: { ownerUserId: input.userId },
        },
        select: { id: true },
      }),
    );
  if (input.eventType === 'POSTED')
    return Boolean(
      await tx.postRecord.findFirst({
        where: {
          ...base,
          bunshinId: input.sourceBunshinId ?? '',
          actorUserId: input.userId,
        },
        select: { id: true },
      }),
    );
  if (input.eventType === 'FEEDBACK_RECORDED')
    return Boolean(
      await tx.missionFeedback.findFirst({
        where: {
          ...base,
          bunshinId: input.sourceBunshinId ?? '',
          actorUserId: input.userId,
        },
        select: { id: true },
      }),
    );
  return Boolean(
    await tx.socialImageGeneratedMedia.findFirst({
      where: {
        ...base,
        ownerUserId: input.userId,
        status: 'READY',
        request: { bunshinId: input.sourceBunshinId ?? '' },
      },
      select: { id: true },
    }),
  );
}

export async function badgeActivityDates(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  eventType: CommonBadgeCandidate['eventType'],
  through: Date,
): Promise<Date[]> {
  if (eventType === 'BUNSHIN_CREATED')
    return (
      await tx.bunshin.findMany({
        where: {
          workspaceId,
          ownerUserId: userId,
          createdAt: { lte: through },
          status: { not: 'ARCHIVED' },
        },
        select: { createdAt: true },
      })
    ).map((x) => x.createdAt);
  if (eventType === 'STRATEGY_APPROVED')
    return (
      await tx.socialAccountStrategy.findMany({
        where: {
          workspaceId,
          approvedAt: { not: null, lte: through },
          bunshin: { ownerUserId: userId },
        },
        select: { approvedAt: true },
      })
    ).flatMap((x) => (x.approvedAt ? [x.approvedAt] : []));
  if (eventType === 'MISSION_VIEWED')
    return (
      await tx.missionActivity.findMany({
        where: { workspaceId, actorUserId: userId, type: 'VIEWED', occurredAt: { lte: through } },
        select: { occurredAt: true },
      })
    ).map((x) => x.occurredAt);
  if (eventType === 'MISSION_ACCEPTED')
    return (
      await tx.missionDecision.findMany({
        where: {
          workspaceId,
          decision: 'ACCEPTED',
          decidedAt: { not: null, lte: through },
          bunshin: { ownerUserId: userId },
        },
        select: { decidedAt: true },
      })
    ).flatMap((x) => (x.decidedAt ? [x.decidedAt] : []));
  if (eventType === 'POSTED')
    return (
      await tx.postRecord.findMany({
        where: { workspaceId, actorUserId: userId, postedAt: { lte: through } },
        select: { postedAt: true },
      })
    ).map((x) => x.postedAt);
  if (eventType === 'FEEDBACK_RECORDED')
    return (
      await tx.missionFeedback.findMany({
        where: { workspaceId, actorUserId: userId, createdAt: { lte: through } },
        select: { createdAt: true },
      })
    ).map((x) => x.createdAt);
  return (
    await tx.socialImageGeneratedMedia.findMany({
      where: { workspaceId, ownerUserId: userId, status: 'READY', createdAt: { lte: through } },
      select: { createdAt: true },
    })
  ).map((x) => x.createdAt);
}
