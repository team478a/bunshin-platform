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
  };
  funnel: Record<AdminUserStage, number>;
  users: AdminUserSummary[];
  truncated: boolean;
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
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
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
