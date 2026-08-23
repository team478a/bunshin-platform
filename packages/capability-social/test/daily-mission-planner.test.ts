import { describe, expect, it, vi } from 'vitest';
import {
  GenerateDailyMissionBrief,
  type DailyMissionPlannerInput,
  type DailyMissionPlannerOutput,
} from '../src';

const now = new Date('2026-08-21T00:00:00.000Z');
const input: DailyMissionPlannerInput = {
  workspaceId: 'workspace-trusted',
  bunshinId: 'bunshin-trusted',
  missionDate: '2026-08-21',
  timezone: 'Asia/Tokyo',
  socialProfile: {
    id: 'profile-trusted',
    workspaceId: 'workspace-trusted',
    bunshinId: 'bunshin-trusted',
    platform: 'X',
    handle: null,
    profileUrl: null,
    purpose: '発信',
    postingFrequency: 'WEEKDAYS',
    preferredFormats: ['TEXT'],
    defaultAssistanceLevel: 'READY_TO_USE',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  },
  bunshin: {
    name: 'BUNSHIN',
    objectiveSummary: '発信を継続する',
    audienceSummary: '副業初心者',
    personalitySummary: '丁寧',
  },
  approvedStrategy: {
    id: 'strategy-trusted',
    workspaceId: 'workspace-trusted',
    bunshinId: 'bunshin-trusted',
    socialProfileId: 'profile-trusted',
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
  },
  weeklyPlan: {
    id: 'plan-trusted',
    workspaceId: 'workspace-trusted',
    bunshinId: 'bunshin-trusted',
    weekStartDate: '2026-08-17',
    timezone: 'Asia/Tokyo',
    strategySummary: '今週は実践例を伝える',
    status: 'CONFIRMED',
    confirmedAt: now,
    expiredAt: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'item-trusted',
        workspaceId: 'workspace-trusted',
        bunshinId: 'bunshin-trusted',
        weeklyPlanId: 'plan-trusted',
        scheduledDate: '2026-08-21',
        contentPillarId: 'pillar-trusted',
        goal: '共感を得る',
        angle: '失敗から学んだこと',
        recommendedFormat: 'TEXT',
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  },
  contentPillars: [
    {
      id: 'pillar-trusted',
      workspaceId: 'workspace-trusted',
      bunshinId: 'bunshin-trusted',
      title: '実践知',
      description: '実践から得た学び',
      weight: 100,
      active: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
  grantedKnowledge: [{ type: 'SKILL', title: '経験', content: '10年の経験' }],
};

const output: DailyMissionPlannerOutput = {
  topic: ' 失敗から学んだ一つの工夫 ',
  angle: ' 初心者が今日試せる形で伝える ',
  reason: ' 週間計画と対象者の悩みに合うため ',
  estimatedMinutes: 5,
};

function provider(value: DailyMissionPlannerOutput = output) {
  return {
    generate: vi.fn().mockResolvedValue({
      output: value,
      model: 'gpt-5.2',
      promptVersion: 'daily-mission-planner-v1',
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 30,
    }),
  };
}

describe('GenerateDailyMissionBrief', () => {
  it('returns a normalized brief with trusted relation and format values', async () => {
    const planner = provider();
    const result = await new GenerateDailyMissionBrief(planner).execute(input);

    expect(result.output).toEqual({
      missionDate: '2026-08-21',
      socialProfileId: 'profile-trusted',
      weeklyPlanItemId: 'item-trusted',
      format: 'TEXT',
      topic: '失敗から学んだ一つの工夫',
      angle: '初心者が今日試せる形で伝える',
      reason: '週間計画と対象者の悩みに合うため',
      estimatedMinutes: 5,
    });
    expect(planner.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyItem: expect.objectContaining({ recommendedFormat: 'TEXT' }),
        contentPillar: { title: '実践知', description: '実践から得た学び' },
        grantedKnowledge: input.grantedKnowledge,
      }),
    );
    const providerInput = planner.generate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(JSON.stringify(providerInput)).not.toContain('workspace-trusted');
    expect(JSON.stringify(providerInput)).not.toContain('item-trusted');
  });

  it.each([
    ['unconfirmed plan', { weeklyPlan: { ...input.weeklyPlan, status: 'DRAFT' as const } }],
    [
      'cross-workspace profile',
      { socialProfile: { ...input.socialProfile, workspaceId: 'other' } },
    ],
    [
      'cross-bunshin strategy',
      { approvedStrategy: { ...input.approvedStrategy, bunshinId: 'other' } },
    ],
    ['cross-bunshin weekly plan', { weeklyPlan: { ...input.weeklyPlan, bunshinId: 'other' } }],
    ['timezone mismatch', { timezone: 'UTC' }],
    ['missing date item', { missionDate: '2026-08-20' }],
    [
      'inactive pillar',
      { contentPillars: input.contentPillars.map((pillar) => ({ ...pillar, active: false })) },
    ],
  ])('rejects %s before calling the provider', async (_name, override) => {
    const planner = provider();
    await expect(
      new GenerateDailyMissionBrief(planner).execute({ ...input, ...override }),
    ).rejects.toMatchObject({ code: expect.any(String) });
    expect(planner.generate).not.toHaveBeenCalled();
  });

  it('rejects a provider estimate above the user time budget', async () => {
    await expect(
      new GenerateDailyMissionBrief(provider({ ...output, estimatedMinutes: 6 })).execute(input),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
