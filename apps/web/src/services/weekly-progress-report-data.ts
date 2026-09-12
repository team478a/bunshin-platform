import 'server-only';
import type { prisma } from '@bunshin/database';
import {
  buildWeeklyProgressSummary,
  summarizeExpiringPointGrants,
  WEEKLY_COPY_ACTIVITY_TYPES,
  type WeeklyProgressMetrics,
} from './weekly-progress-report';

type Window = {
  weekStart: string;
  weekEnd: string;
  startAt: Date;
  endAt: Date;
  isCurrent: boolean;
};

type Participant = {
  userId: string;
  displayName: string;
  bunshins: { id: string; name: string }[];
};

export type ServiceWeeklyProgressReport = ReturnType<typeof buildWeeklyProgressSummary> & {
  userId: string;
  displayName: string;
  bunshins: { id: string; name: string }[];
  pointRecoveryNotice: string | null;
};

const uniqueMissionCount = (items: { dailyMissionId: string }[]) =>
  new Set(items.map(({ dailyMissionId }) => dailyMissionId)).size;

export async function loadServiceWeeklyProgressReports(input: {
  client: typeof prisma;
  workspaceId: string;
  groupId: string;
  window: Window;
  userId?: string;
  asOf?: Date;
}) {
  const memberships = await input.client.groupMembership.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ACTIVE',
      ...(input.userId
        ? { userId: input.userId }
        : { serviceRole: 'PARTICIPANT' as const, consentedAt: { not: null } }),
      user: { status: 'ACTIVE' },
    },
    select: { userId: true, user: { select: { displayName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const userIds = memberships.map(({ userId }) => userId);
  const bunshins = userIds.length
    ? await input.client.bunshin.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: { in: userIds },
          status: { not: 'ARCHIVED' },
        },
        select: { id: true, name: true, ownerUserId: true },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const participants: Participant[] = memberships.map((membership) => ({
    userId: membership.userId,
    displayName: membership.user.displayName,
    bunshins: bunshins
      .filter(({ ownerUserId }) => ownerUserId === membership.userId)
      .map(({ id, name }) => ({ id, name })),
  }));
  if (!participants.length) return [];
  const asOf = input.asOf ?? new Date();
  const pointExpiryWarningEnd = new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000);
  const bunshinIds = bunshins.map(({ id }) => id);
  const timestamp = { gte: input.window.startAt, lt: input.window.endAt };
  const missionDate = {
    gte: new Date(`${input.window.weekStart}T00:00:00.000Z`),
    lte: new Date(`${input.window.weekEnd}T00:00:00.000Z`),
  };
  const [
    missions,
    activities,
    posts,
    materials,
    variants,
    points,
    expiringGrants,
    badges,
    pointAccounts,
    recoveryAudits,
    recoveryLinks,
  ] = await Promise.all([
    input.client.dailyMission.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: { in: bunshinIds }, missionDate },
      select: { id: true, bunshinId: true },
    }),
    input.client.missionActivity.findMany({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: { in: bunshinIds },
        actorUserId: { in: userIds },
        occurredAt: timestamp,
      },
      select: { actorUserId: true, bunshinId: true, dailyMissionId: true, type: true },
    }),
    input.client.postRecord.findMany({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: { in: bunshinIds },
        actorUserId: { in: userIds },
        postedAt: timestamp,
      },
      select: { actorUserId: true, bunshinId: true, dailyMissionId: true },
    }),
    input.client.bunshinMemory.findMany({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: { in: bunshinIds },
        sourceType: 'USER_INPUT',
        sourceId: { startsWith: 'daily-action:' },
        active: true,
        deletedAt: null,
        createdAt: timestamp,
      },
      select: { bunshin: { select: { ownerUserId: true } } },
    }),
    input.client.missionContentVariantSelection.findMany({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: { in: bunshinIds },
        actorUserId: { in: userIds },
        selectedAt: timestamp,
      },
      select: { actorUserId: true, bunshinId: true, variantId: true },
    }),
    input.client.pointTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: { in: userIds },
        createdAt: timestamp,
        type: { in: ['GRANT', 'CONSUME'] },
      },
      select: { userId: true, type: true, amount: true },
    }),
    input.client.pointTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        userId: { in: userIds },
        type: 'GRANT',
        expiresAt: { gt: asOf, lte: pointExpiryWarningEnd },
      },
      select: {
        userId: true,
        amount: true,
        expiresAt: true,
        consumptions: { select: { amount: true } },
      },
      orderBy: { expiresAt: 'asc' },
    }),
    input.client.badgeAward.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: { in: userIds },
        status: 'ACTIVE',
        awardedAt: timestamp,
      },
      select: { userId: true, badgeVersion: { select: { title: true } } },
    }),
    input.client.pointAccount.findMany({
      where: { workspaceId: input.workspaceId, userId: { in: userIds } },
      select: { userId: true, recoveryDue: true },
    }),
    input.client.serviceConfigurationAudit.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        action: { in: ['POINT_RECOVERY_REGISTERED', 'POINT_RECOVERY_CANCELLED'] },
        occurredAt: timestamp,
      },
      select: { action: true, afterData: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
    }),
    input.client.pointConsumptionLink.findMany({
      where: {
        createdAt: timestamp,
        grantTransaction: {
          sourceType: { not: 'OPERATOR_RECOVERY_CANCELLATION' },
        },
        consumptionTransaction: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: { in: userIds },
          type: 'RECOVERY',
          sourceType: 'OPERATOR_RECOVERY',
        },
      },
      select: {
        createdAt: true,
        consumptionTransaction: {
          select: {
            id: true,
            userId: true,
            amount: true,
            consumptionFor: { select: { amount: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const missionOwner = new Map(bunshins.map(({ id, ownerUserId }) => [id, ownerUserId] as const));
  return participants.map((participant): ServiceWeeklyProgressReport => {
    const ownsBunshin = (bunshinId: string) => missionOwner.get(bunshinId) === participant.userId;
    const ownActivities = activities.filter(
      ({ actorUserId, bunshinId }) => actorUserId === participant.userId && ownsBunshin(bunshinId),
    );
    const byType = (types: string[]) => ownActivities.filter(({ type }) => types.includes(type));
    const ownPoints = points.filter(({ userId }) => userId === participant.userId);
    const pointExpiry = summarizeExpiringPointGrants(
      expiringGrants.filter(({ userId }) => userId === participant.userId),
    );
    const recoveryDue =
      pointAccounts.find(({ userId }) => userId === participant.userId)?.recoveryDue ?? 0;
    const recoveryAudit = recoveryAudits.find(({ afterData }) => {
      const data =
        typeof afterData === 'object' && afterData !== null && !Array.isArray(afterData)
          ? (afterData as Record<string, unknown>)
          : {};
      return data['userId'] === participant.userId;
    });
    const completedRecovery = recoveryLinks.find(({ consumptionTransaction }) => {
      if (consumptionTransaction.userId !== participant.userId) return false;
      const linked = consumptionTransaction.consumptionFor.reduce(
        (sum, item) => sum + item.amount,
        0,
      );
      return linked >= Math.abs(consumptionTransaction.amount);
    });
    const pointRecoveryNotice =
      recoveryAudit &&
      (!completedRecovery || recoveryAudit.occurredAt >= completedRecovery.createdAt)
        ? recoveryAudit.action === 'POINT_RECOVERY_CANCELLED'
          ? '誤って登録されたポイント回収が取り消され、回収済みポイントが戻りました。'
          : recoveryDue > 0
            ? `ポイント訂正のため、現在${recoveryDue} WPが回収未済です。新しく受け取るポイントから自動で充てられます。`
            : '運営者によるポイント訂正が完了しました。'
        : completedRecovery
          ? 'ポイントの回収未済分が解消し、ポイント交換を再び利用できるようになりました。'
          : null;
    const metrics: WeeklyProgressMetrics = {
      missions: missions.filter(
        ({ bunshinId }) => missionOwner.get(bunshinId) === participant.userId,
      ).length,
      viewed: uniqueMissionCount(byType(['VIEWED'])),
      confirmed: uniqueMissionCount(byType(['CONFIRMED'])),
      copied: uniqueMissionCount(byType([...WEEKLY_COPY_ACTIVITY_TYPES])),
      posted: uniqueMissionCount(
        posts.filter(
          ({ actorUserId, bunshinId }) =>
            actorUserId === participant.userId && ownsBunshin(bunshinId),
        ),
      ),
      rested: uniqueMissionCount(byType(['RESTED'])),
      materials: materials.filter(({ bunshin }) => bunshin.ownerUserId === participant.userId)
        .length,
      variantsUsed: new Set(
        variants
          .filter(
            ({ actorUserId, bunshinId }) =>
              actorUserId === participant.userId && ownsBunshin(bunshinId),
          )
          .map(({ variantId }) => variantId),
      ).size,
      pointsEarned: ownPoints
        .filter(({ type }) => type === 'GRANT')
        .reduce((sum, { amount }) => sum + Math.max(0, amount), 0),
      pointsUsed: Math.abs(
        ownPoints
          .filter(({ type }) => type === 'CONSUME')
          .reduce((sum, { amount }) => sum + amount, 0),
      ),
      ...pointExpiry,
      badges: badges
        .filter(({ userId }) => userId === participant.userId)
        .map(({ badgeVersion }) => badgeVersion.title),
    };
    return {
      userId: participant.userId,
      displayName: participant.displayName,
      bunshins: participant.bunshins,
      pointRecoveryNotice,
      ...buildWeeklyProgressSummary(metrics),
    };
  });
}
