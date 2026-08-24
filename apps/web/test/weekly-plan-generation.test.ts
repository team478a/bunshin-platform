import type { ApplicationError } from '@bunshin/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyPlanGenerationService } from '../src/services/weekly-plan-generation';

const now = new Date('2026-08-22T00:00:00.000Z');
const scope = {
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
};
const pillar = {
  id: 'pillar-1',
  ...scope,
  title: '実践知',
  description: '実践から得た学び',
  weight: 100,
  active: true,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};
const profile = {
  id: 'profile-1',
  workspaceId: scope.workspaceId,
  bunshinId: scope.bunshinId,
  platform: 'X',
  handle: null,
  profileUrl: null,
  purpose: '発信',
  postingFrequency: 'WEEKDAYS',
  preferredFormats: ['TEXT'],
  status: 'ACTIVE',
  createdAt: now,
  updatedAt: now,
};
const strategy = {
  id: 'strategy-1',
  workspaceId: scope.workspaceId,
  bunshinId: scope.bunshinId,
  socialProfileId: profile.id,
  platform: 'X',
  goal: 'FOLLOWERS',
  availableMinutes: 5,
  destinationType: 'PROFILE',
  destinationDetail: null,
  concept: '専門家型',
  positioning: '実践者',
  targetSummary: '副業初心者',
  profileDraft: 'プロフィール案',
  ctaStrategy: 'プロフィール誘導',
  postingPolicy: '平日投稿',
  version: 1,
  status: 'APPROVED',
  approvedAt: now,
  supersededAt: null,
  createdAt: now,
  updatedAt: now,
};
const generatedPlan = {
  id: 'plan-1',
  workspaceId: scope.workspaceId,
  bunshinId: scope.bunshinId,
  weekStartDate: '2026-08-24',
  timezone: 'Asia/Tokyo',
  strategySummary: '今週の方針',
  status: 'DRAFT',
  confirmedAt: null,
  expiredAt: null,
  createdAt: now,
  updatedAt: now,
  items: [],
};

describe('WeeklyPlanGenerationService', () => {
  const generate = vi.fn();
  const createGeneratedPlan = vi.fn();
  const recordUsage = vi.fn();
  const listPlans = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    listPlans.mockResolvedValue([]);
    createGeneratedPlan.mockResolvedValue(generatedPlan);
    generate.mockResolvedValue({
      output: {
        strategySummary: '今週の方針',
        items: [
          {
            scheduledDate: '2026-08-24',
            contentPillarId: pillar.id,
            goal: '共感を得る',
            angle: '最初の一歩',
            recommendedFormat: 'TEXT',
            notes: null,
          },
        ],
      },
      model: 'gpt-test',
      promptVersion: 'weekly-v1',
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 30,
    });
  });

  const service = () =>
    new WeeklyPlanGenerationService({
      assignments: {
        find: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
      } as never,
      plans: { listPlans, createGeneratedPlan } as never,
      pillars: { list: vi.fn().mockResolvedValue([pillar]) } as never,
      profiles: { list: vi.fn().mockResolvedValue([profile]) } as never,
      strategies: { list: vi.fn().mockResolvedValue([strategy]) } as never,
      bunshins: {
        find: vi.fn().mockResolvedValue({
          name: 'BUNSHIN',
          objectiveSummary: '継続',
          audienceSummary: '副業初心者',
          personalitySummary: '丁寧',
        }),
      } as never,
      knowledge: {
        listGrantedKnowledge: vi
          .fn()
          .mockResolvedValue([{ type: 'SKILL', title: '経験', content: '10年の経験' }]),
      } as never,
      planner: { generate },
      providerModel: 'gpt-test',
      resolveTimezone: vi.fn().mockResolvedValue('Asia/Tokyo'),
      recordUsage,
      now: () => now.valueOf(),
    });

  it('uses only scoped inputs, resolves timezone, persists the plan, and records usage', async () => {
    const result = await service().execute({
      ...scope,
      weekStartDate: '2026-08-24',
      usageIdempotencyKey: 'job:job-1:weekly-plan',
      existingPolicy: 'RETURN',
    });

    expect(result.plan).toEqual(generatedPlan);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        weekStartDate: '2026-08-24',
        timezone: 'Asia/Tokyo',
        platform: 'X',
        grantedKnowledge: [{ type: 'SKILL', title: '経験', content: '10年の経験' }],
      }),
    );
    expect(createGeneratedPlan).toHaveBeenCalledWith(
      expect.objectContaining({ ...scope, weekStartDate: '2026-08-24', timezone: 'Asia/Tokyo' }),
    );
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCESS', idempotencyKey: 'job:job-1:weekly-plan' }),
    );
  });

  it('returns an existing week without calling the provider in idempotent job mode', async () => {
    listPlans.mockResolvedValue([generatedPlan]);
    const result = await service().execute({
      ...scope,
      weekStartDate: '2026-08-24',
      usageIdempotencyKey: 'job:job-1:weekly-plan',
      existingPolicy: 'RETURN',
    });
    expect(result.plan).toEqual(generatedPlan);
    expect(generate).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('keeps the manual API conflict behavior for an existing week', async () => {
    listPlans.mockResolvedValue([generatedPlan]);
    await expect(
      service().execute({
        ...scope,
        weekStartDate: '2026-08-24',
        usageIdempotencyKey: 'request-1:weekly-plan',
        existingPolicy: 'CONFLICT',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<ApplicationError>);
    expect(generate).not.toHaveBeenCalled();
  });

  it('records a failed provider attempt without storing provider payloads', async () => {
    generate.mockRejectedValue(new Error('provider secret response'));
    await expect(
      service().execute({
        ...scope,
        weekStartDate: '2026-08-24',
        usageIdempotencyKey: 'job:job-2:weekly-plan',
        existingPolicy: 'RETURN',
      }),
    ).rejects.toThrow('provider secret response');
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        errorCode: 'INTERNAL_ERROR',
        idempotencyKey: 'job:job-2:weekly-plan',
      }),
    );
    expect(JSON.stringify(recordUsage.mock.calls)).not.toContain('provider secret response');
  });
});
