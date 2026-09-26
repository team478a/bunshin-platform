import type { AdminUserStage, AdminUserSummary } from '@bunshin/application';
import type { Prisma } from './client';

export const adminUserSelect = {
  id: true,
  displayName: true,
  email: true,
  status: true,
  createdAt: true,
  identities: { select: { provider: true } },
  memberships: {
    select: { role: true, status: true, workspace: { select: { id: true, name: true } } },
  },
  groupMemberships: {
    where: { status: 'ACTIVE' },
    select: { groupId: true, group: { select: { name: true } } },
  },
  activityMetricExclusionsAsTarget: {
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    select: { environment: true, action: true, occurredAt: true },
  },
  bunshins: {
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      capabilityAssignments: {
        where: { capabilityType: 'SOCIAL', status: 'ACTIVE' },
        select: { id: true },
      },
      socialAccountStrategies: {
        where: { status: 'APPROVED' },
        select: { id: true },
      },
    },
  },
  missionActivities: {
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: { type: true, occurredAt: true },
  },
  postRecords: {
    orderBy: { postedAt: 'desc' },
    take: 50,
    select: { postedAt: true },
  },
  aiUsageEvents: {
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: { status: true, occurredAt: true, estimatedCostUsdMicros: true, errorCode: true },
  },
  lineConnections: {
    select: { environment: true, status: true, friendshipStatus: true, updatedAt: true },
  },
  accountDeletionRequests: {
    where: { status: { in: ['REQUESTED', 'PROCESSING', 'BLOCKED'] } },
    select: { id: true },
  },
  _count: { select: { postRecords: true, aiUsageEvents: true } },
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

const copyActivityTypes = new Set([
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
]);

export function adminUserSummary(
  row: AdminUserRow,
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION',
  now = new Date(),
): AdminUserSummary {
  const activityTypes = new Set(row.missionActivities.map(({ type }) => type));
  let stage: AdminUserStage = 'REGISTERED';
  if (row.bunshins.length > 0) stage = 'BUNSHIN_CREATED';
  if (row.bunshins.some(({ capabilityAssignments }) => capabilityAssignments.length > 0))
    stage = 'SOCIAL_ACTIVATED';
  if (row.bunshins.some(({ socialAccountStrategies }) => socialAccountStrategies.length > 0))
    stage = 'STRATEGY_APPROVED';
  if (activityTypes.has('VIEWED')) stage = 'MISSION_VIEWED';
  if (activityTypes.has('ACCEPTED')) stage = 'MISSION_ACCEPTED';
  if ([...activityTypes].some((type) => copyActivityTypes.has(type))) stage = 'COPIED';
  if (row.postRecords.length > 0) stage = 'POSTED';

  const lineConnections = row.lineConnections.filter((item) => item.environment === environment);
  const activityDates = [
    row.createdAt,
    ...row.missionActivities.map(({ occurredAt }) => occurredAt),
    ...row.postRecords.map(({ postedAt }) => postedAt),
    ...row.aiUsageEvents.map(({ occurredAt }) => occurredAt),
    ...lineConnections.map(({ updatedAt }) => updatedAt),
  ];
  const lastActiveAt = new Date(Math.max(...activityDates.map((value) => value.getTime())));
  const deletionPending = row.accountDeletionRequests.length > 0;
  const latestMetricAction = row.activityMetricExclusionsAsTarget.find(
    (item) => item.environment === environment,
  );
  let attentionReason: string | null = null;
  if (row.status !== 'ACTIVE') attentionReason = '利用停止・退会済み';
  else if (deletionPending) attentionReason = '退会処理待ち';
  else if (row.bunshins.length === 0 && now.getTime() - row.createdAt.getTime() >= 86_400_000)
    attentionReason = '投稿パートナーが未作成';
  else if (now.getTime() - lastActiveAt.getTime() >= 7 * 86_400_000)
    attentionReason = '7日以上利用がありません';
  else if (row.aiUsageEvents.filter(({ status }) => status === 'FAILED').length >= 3)
    attentionReason = 'AI処理が繰り返し失敗';

  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    status: row.status,
    createdAt: row.createdAt,
    authProviders: [...new Set(row.identities.map(({ provider }) => provider))],
    bunshinCount: row.bunshins.length,
    postCount: row._count.postRecords,
    aiCalls: row._count.aiUsageEvents,
    aiFailedCalls: row.aiUsageEvents.filter(({ status }) => status === 'FAILED').length,
    lineConnected: lineConnections.some(({ status }) => status === 'ACTIVE'),
    lineFollowing: lineConnections.some(({ friendshipStatus }) => friendshipStatus === 'FOLLOWING'),
    deletionPending,
    lastActiveAt,
    stage,
    attentionReason,
    excludedFromMetrics: latestMetricAction?.action === 'EXCLUDED',
    periodConfirmations: 0,
    periodPosts: 0,
  };
}
