import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  weeklySocialGoalPlanningProfile,
  type SocialAccountStrategy,
  type SocialAccountStrategyGoal,
} from '@bunshin/capability-social';
import { describe, expect, it, vi } from 'vitest';
import { buildDailyMissionPersonalizationBase } from '../src/services/daily-mission-personalization';
import { WeeklyPlanGenerationService } from '../src/services/weekly-plan-generation';

const now = new Date('2026-10-01T00:00:00.000Z');
const scope = {
  workspaceId: 'workspace-hassy-goal-audit',
  groupId: 'service-hassy',
  bunshinId: 'bunshin-salon',
  actorUserId: 'user-salon',
};
const profile = {
  id: 'profile-instagram',
  workspaceId: scope.workspaceId,
  bunshinId: scope.bunshinId,
  platform: 'INSTAGRAM' as const,
  handle: null,
  profileUrl: null,
  purpose: '美容室の情報発信',
  postingFrequency: 'THREE_PER_WEEK' as const,
  preferredFormats: ['TEXT' as const, 'IMAGE' as const],
  defaultAssistanceLevel: 'READY_TO_USE' as const,
  status: 'ACTIVE' as const,
  createdAt: now,
  updatedAt: now,
};
const pillar = {
  id: 'pillar-salon',
  ...scope,
  title: '美容室のお役立ち情報',
  description: '初めて利用する人にも分かる美容室情報',
  weight: 100,
  active: true,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};

function strategy(goal: SocialAccountStrategyGoal): SocialAccountStrategy {
  return {
    id: `strategy-${goal}`,
    workspaceId: scope.workspaceId,
    bunshinId: scope.bunshinId,
    socialProfileId: profile.id,
    platform: profile.platform,
    goal,
    availableMinutes: 5,
    destinationType: 'PROFILE',
    destinationDetail: null,
    // Keep every generated field identical so this test isolates propagation of the typed goal.
    concept: '地域の人へ美容室の価値を分かりやすく伝える',
    positioning: '髪の悩みを相談できる地域の美容室',
    targetSummary: '地域で美容室を探している20〜40代',
    profileDraft: '地域の髪の相談窓口',
    ctaStrategy: 'プロフィールを確認してもらう',
    postingPolicy: '週3回、役立つ情報を伝える',
    version: 1,
    status: 'APPROVED',
    approvedAt: now,
    supersededAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('Hassy SNS goal propagation characterization', () => {
  it('records that the simple service setup derives the initial strategy from the business purpose', async () => {
    const sourcePath = fileURLToPath(
      new URL(
        '../app/s/[serviceSlug]/bunshins/[bunshinId]/simple-first-post-setup.tsx',
        import.meta.url,
      ),
    );
    const source = await readFile(sourcePath, 'utf8');

    expect(source).toContain('initialSocialAccountStrategyGoal(primaryPurpose)');
    expect(source).toContain("initialGoal?.status === 'RESOLVED' ? initialGoal.goal : ''");
    expect(source).toContain('SNSで最も増やしたい成果を選んでください。');
  });

  it('records that a goal-only change reaches the weekly planner as a distinct typed policy', async () => {
    const goals: SocialAccountStrategyGoal[] = [
      'BRAND_AWARENESS',
      'INQUIRY',
      'SALES',
      'RECRUIT',
      'FOLLOWERS',
    ];
    const captured: unknown[] = [];

    for (const goal of goals) {
      const generate = vi.fn((input: unknown) => {
        captured.push(input);
        return Promise.resolve({
          output: {
            strategySummary: '今週の方針',
            items: [
              {
                scheduledDate: '2026-10-05',
                contentPillarId: pillar.id,
                goal: '髪の相談に役立つ情報を伝える',
                angle: '初めての人向け',
                recommendedFormat: 'TEXT' as const,
                notes: null,
                campaignId: null,
                classification: 'ORGANIC' as const,
                businessContentCategory: null,
              },
            ],
          },
          model: 'fake-no-network',
          promptVersion: 'characterization',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        });
      });
      const service = new WeeklyPlanGenerationService({
        assignments: { find: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) } as never,
        plans: {
          listPlans: vi.fn().mockResolvedValue([]),
          createGeneratedPlan: vi.fn().mockResolvedValue({ id: `plan-${goal}`, items: [] }),
        } as never,
        pillars: { list: vi.fn().mockResolvedValue([pillar]) } as never,
        profiles: { list: vi.fn().mockResolvedValue([profile]) } as never,
        strategies: { list: vi.fn().mockResolvedValue([strategy(goal)]) } as never,
        bunshins: {
          find: vi.fn().mockResolvedValue({
            name: '美容室SNS担当',
            objectiveSummary: '美容室の発信を支援する',
            audienceSummary: '地域の20〜40代',
            personalitySummary: '親しみやすく丁寧',
          }),
        } as never,
        knowledge: { listGrantedKnowledge: vi.fn().mockResolvedValue([]) } as never,
        reserveProviderRuntime: vi.fn().mockResolvedValue({
          planner: { generate },
          model: 'fake-no-network',
          requestCostUsdMicros: 1,
          admission: null,
        }),
        settleProviderRuntime: vi.fn(),
        resolveTimezone: vi.fn().mockResolvedValue('Asia/Tokyo'),
        recordUsage: vi.fn(),
        recordUsageStrict: vi.fn(),
        runWithQuota: (input) => input.generate(),
        now: () => now.valueOf(),
      });

      await service.execute({
        ...scope,
        weekStartDate: '2026-10-05',
        usageIdempotencyKey: `goal-audit:${goal}`,
        existingPolicy: 'CONFLICT',
        includeGrantedKnowledge: false,
        includeCampaigns: false,
      });
    }

    const inputs = captured as Array<{
      approvedStrategy: { goal: SocialAccountStrategyGoal; goalPlanning: unknown };
    }>;
    expect(
      new Set(inputs.map(({ approvedStrategy }) => JSON.stringify(approvedStrategy))),
    ).toHaveLength(goals.length);
    inputs.forEach(({ approvedStrategy }, index) => {
      expect(approvedStrategy).toMatchObject({
        goal: goals[index],
        goalPlanning: weeklySocialGoalPlanningProfile(goals[index]!),
      });
    });
  });

  it('records that daily planning carries the same typed goal policy in addition to personal context', () => {
    const goals: SocialAccountStrategyGoal[] = [
      'BRAND_AWARENESS',
      'INQUIRY',
      'SALES',
      'RECRUIT',
      'FOLLOWERS',
    ];

    const contexts = goals.map((goal) =>
      buildDailyMissionPersonalizationBase({
        bunshin: {
          name: '美容室SNS担当',
          objectiveSummary: '美容室のSNS支援',
          audienceSummary: '地域の20〜40代',
          personalitySummary: '親しみやすく丁寧',
        },
        personality: null,
        socialProfile: profile,
        strategy: strategy(goal),
        history: {
          businessProfile: {
            industry: '美容室',
            businessName: 'サンプル美容室',
            region: '東京都',
            productService: 'カット・カラー',
            primaryPurpose: 'AWARENESS',
            targetAudience: '地域の20〜40代',
          },
          onboardingContext: null,
          behaviorSummary: null,
          feedbackSummary: null,
          performanceSummary: null,
        },
        officialKnowledge: null,
        grantedKnowledge: [],
        personalMaterials: [],
      }),
    );

    contexts.forEach(({ strategyContext, plannerPersonalization }, index) => {
      expect(strategyContext).toMatchObject({
        goal: goals[index],
        goalPlanning: weeklySocialGoalPlanningProfile(goals[index]!),
      });
      const accountStrategy = plannerPersonalization.signals.find(
        ({ type }: { type: string }) => type === 'ACCOUNT_STRATEGY',
      );
      expect(accountStrategy?.value).toContain(`目標: ${goals[index]}`);
    });
  });
});
