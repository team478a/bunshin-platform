import { ApplicationError } from '@bunshin/shared';

export const ADMIN_USER_STAGES = [
  'REGISTERED',
  'BUNSHIN_CREATED',
  'SOCIAL_ACTIVATED',
  'STRATEGY_APPROVED',
  'MISSION_VIEWED',
  'MISSION_ACCEPTED',
  'COPIED',
  'POSTED',
] as const;
export type AdminUserStage = (typeof ADMIN_USER_STAGES)[number];

export interface AdminUserSummary {
  id: string;
  displayName: string;
  email: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: Date;
  authProviders: Array<'EMAIL' | 'LINE'>;
  bunshinCount: number;
  postCount: number;
  aiCalls: number;
  aiFailedCalls: number;
  lineConnected: boolean;
  lineFollowing: boolean;
  deletionPending: boolean;
  lastActiveAt: Date | null;
  stage: AdminUserStage;
  attentionReason: string | null;
}

export interface AdminOperationsSnapshot {
  period: { from: Date; to: Date };
  totals: {
    users: number;
    activeUsers: number;
    newUsers: number;
    posts: number;
    aiCalls: number;
    aiFailedCalls: number;
    estimatedAiCostUsdMicros: number | null;
    lineConnectedUsers: number;
    attentionUsers: number;
    deletionPendingUsers: number;
    lineSent: number;
    lineFailed: number;
    supportCasesCreated: number;
    supportCasesResolved: number;
  };
  funnel: Record<AdminUserStage, number>;
  retention: {
    d1EligibleUsers: number;
    d1ActiveUsers: number;
    d1ActiveRate: number | null;
    d7EligibleUsers: number;
    d7ActiveUsers: number;
    d7ActiveRate: number | null;
    firstWeekThreePostEligibleUsers: number;
    firstWeekThreePostUsers: number;
    firstWeekThreePostRate: number | null;
  };
  users: AdminUserSummary[];
  truncated: boolean;
}

export function calculateFirstWeekThreePostKpi(input: {
  cohort: Array<{ userId: string; createdAt: Date }>;
  posts: Array<{ userId: string; postedAt: Date }>;
  periodEnd: Date;
}) {
  const week = 7 * 86_400_000;
  const eligible = input.cohort.filter(
    ({ createdAt }) => createdAt.getTime() + week <= input.periodEnd.getTime(),
  );
  const createdAtByUser = new Map(eligible.map((item) => [item.userId, item.createdAt]));
  const counts = new Map<string, number>();
  for (const post of input.posts) {
    const createdAt = createdAtByUser.get(post.userId);
    if (!createdAt) continue;
    const elapsed = post.postedAt.getTime() - createdAt.getTime();
    if (elapsed < 0 || elapsed >= week) continue;
    counts.set(post.userId, (counts.get(post.userId) ?? 0) + 1);
  }
  const achieved = eligible.filter(({ userId }) => (counts.get(userId) ?? 0) >= 3).length;
  return {
    firstWeekThreePostEligibleUsers: eligible.length,
    firstWeekThreePostUsers: achieved,
    firstWeekThreePostRate: eligible.length ? achieved / eligible.length : null,
  };
}

export function calculateAdminRetention(input: {
  cohort: Array<{ userId: string; createdAt: Date }>;
  activities: Array<{ userId: string; occurredAt: Date }>;
  periodEnd: Date;
}) {
  const createdAtByUser = new Map(input.cohort.map((item) => [item.userId, item.createdAt]));
  const d1Eligible = input.cohort.filter(
    (item) => item.createdAt.getTime() + 2 * 86_400_000 <= input.periodEnd.getTime(),
  );
  const d7Eligible = input.cohort.filter(
    (item) => item.createdAt.getTime() + 8 * 86_400_000 <= input.periodEnd.getTime(),
  );
  const d1Active = new Set<string>();
  const d7Active = new Set<string>();
  for (const activity of input.activities) {
    const createdAt = createdAtByUser.get(activity.userId);
    if (!createdAt) continue;
    const elapsed = activity.occurredAt.getTime() - createdAt.getTime();
    if (elapsed >= 86_400_000 && elapsed < 2 * 86_400_000) d1Active.add(activity.userId);
    if (elapsed >= 7 * 86_400_000 && elapsed < 8 * 86_400_000) d7Active.add(activity.userId);
  }
  return {
    d1EligibleUsers: d1Eligible.length,
    d1ActiveUsers: d1Active.size,
    d1ActiveRate: d1Eligible.length ? d1Active.size / d1Eligible.length : null,
    d7EligibleUsers: d7Eligible.length,
    d7ActiveUsers: d7Active.size,
    d7ActiveRate: d7Eligible.length ? d7Active.size / d7Eligible.length : null,
  };
}

export interface AdminUserTimelineItem {
  type: string;
  occurredAt: Date;
  label: string;
  outcome: 'SUCCESS' | 'FAILED' | 'INFO';
}

export interface AdminUserDetail {
  user: AdminUserSummary;
  workspaces: Array<{ id: string; name: string; role: string; status: string }>;
  bunshins: Array<{ id: string; name: string; status: string; createdAt: Date }>;
  timeline: AdminUserTimelineItem[];
  operationAudits: AdminUserOperationAudit[];
  supportCases: AdminSupportCase[];
}

export interface AdminUserOperationAudit {
  id: string;
  action: 'SUSPENDED' | 'REACTIVATED';
  previousStatus: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  nextStatus: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  reason: string;
  actorDisplayName: string;
  occurredAt: Date;
}

export interface AdminSupportCaseNote {
  id: string;
  content: string;
  authorDisplayName: string;
  createdAt: Date;
}

export interface AdminSupportCase {
  id: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  assigneeUserId: string | null;
  assigneeDisplayName: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  notes: AdminSupportCaseNote[];
}

export interface AdminSupportCaseInboxItem {
  id: string;
  targetUserId: string;
  targetDisplayName: string;
  targetEmail: string | null;
  subject: string;
  status: AdminSupportCase['status'];
  priority: AdminSupportCase['priority'];
  assigneeDisplayName: string | null;
  updatedAt: Date;
}

export interface AdminOperationsRepository {
  snapshot(input: {
    actorUserId: string;
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    from: Date;
    to: Date;
    query: string;
    limit: number;
  }): Promise<AdminOperationsSnapshot | null>;
  userDetail(input: {
    actorUserId: string;
    userId: string;
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  }): Promise<AdminUserDetail | null>;
  setUserStatus(input: {
    actorUserId: string;
    userId: string;
    status: 'ACTIVE' | 'SUSPENDED';
    reason: string;
  }): Promise<boolean | null>;
  createSupportCase(input: {
    actorUserId: string;
    userId: string;
    subject: string;
    priority: AdminSupportCase['priority'];
    note: string;
  }): Promise<boolean | null>;
  updateSupportCase(input: {
    actorUserId: string;
    userId: string;
    supportCaseId: string;
    status: AdminSupportCase['status'];
    priority: AdminSupportCase['priority'];
    assigneeUserId: string | null;
    note: string;
  }): Promise<boolean | null>;
  listSupportCases(input: {
    actorUserId: string;
    status: AdminSupportCase['status'] | null;
  }): Promise<AdminSupportCaseInboxItem[] | null>;
}

function validatePeriod(from: Date, to: Date) {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid period');
  if (to.getTime() - from.getTime() > 366 * 86_400_000)
    throw new ApplicationError('VALIDATION_ERROR', 'period is too long');
}

export class GetAdminOperationsSnapshot {
  constructor(private readonly repository: AdminOperationsRepository) {}
  async execute(input: {
    actorUserId: string;
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    from: Date;
    to: Date;
    query?: string;
    limit?: number;
  }) {
    validatePeriod(input.from, input.to);
    const query = input.query?.trim() ?? '';
    if (query.length > 100) throw new ApplicationError('VALIDATION_ERROR', 'query is too long');
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 5_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid limit');
    const value = await this.repository.snapshot({ ...input, query, limit });
    if (!value) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return value;
  }
}

export class GetAdminUserDetail {
  constructor(private readonly repository: AdminOperationsRepository) {}
  async execute(input: {
    actorUserId: string;
    userId: string;
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  }) {
    if (!/^[0-9a-f-]{36}$/i.test(input.userId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid user id');
    const value = await this.repository.userDetail(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'user not found');
    return value;
  }
}

const uuidPattern = /^[0-9a-f-]{36}$/i;
const validReason = (value: string, maximum = 1000) => {
  const normalized = value.trim();
  if (normalized.length < 5 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid admin reason');
  return normalized;
};

export class SetAdminUserStatus {
  constructor(private readonly repository: AdminOperationsRepository) {}
  async execute(input: {
    actorUserId: string;
    userId: string;
    status: 'ACTIVE' | 'SUSPENDED';
    reason: string;
  }) {
    if (!uuidPattern.test(input.userId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid user id');
    const result = await this.repository.setUserStatus({
      ...input,
      reason: validReason(input.reason),
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'user not found');
    if (!result) throw new ApplicationError('CONFLICT', 'user status cannot be changed');
  }
}

export class CreateAdminSupportCase {
  constructor(private readonly repository: AdminOperationsRepository) {}
  async execute(input: {
    actorUserId: string;
    userId: string;
    subject: string;
    priority: AdminSupportCase['priority'];
    note: string;
  }) {
    const subject = input.subject.trim();
    if (!uuidPattern.test(input.userId) || subject.length < 3 || subject.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid support case');
    const result = await this.repository.createSupportCase({
      ...input,
      subject,
      note: validReason(input.note, 2000),
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'user not found');
    if (!result) throw new ApplicationError('FORBIDDEN', 'admin required');
  }
}

export class UpdateAdminSupportCase {
  constructor(private readonly repository: AdminOperationsRepository) {}
  async execute(input: {
    actorUserId: string;
    userId: string;
    supportCaseId: string;
    status: AdminSupportCase['status'];
    priority: AdminSupportCase['priority'];
    assigneeUserId: string | null;
    note: string;
  }) {
    if (
      !uuidPattern.test(input.userId) ||
      !uuidPattern.test(input.supportCaseId) ||
      (input.assigneeUserId !== null && !uuidPattern.test(input.assigneeUserId))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid support case');
    const result = await this.repository.updateSupportCase({
      ...input,
      note: validReason(input.note, 2000),
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'support case not found');
    if (!result) throw new ApplicationError('FORBIDDEN', 'admin required');
  }
}

export class ListAdminSupportCases {
  constructor(private readonly repository: AdminOperationsRepository) {}
  async execute(input: { actorUserId: string; status?: AdminSupportCase['status'] | null }) {
    const result = await this.repository.listSupportCases({
      actorUserId: input.actorUserId,
      status: input.status ?? null,
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'support inbox not found');
    return result;
  }
}
