import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { SocialAccountStrategy, SocialAccountStrategyGoal } from '@bunshin/capability-social';
import { describe, expect, it, vi } from 'vitest';
import { buildMissionPersonalizationContext } from '../src/services/daily-mission-personalization';
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
  it('records that the simple service setup currently fixes every initial strategy to brand awareness', async () => {
    const sourcePath = fileURLToPath(
      new URL(
        '../app/s/[serviceSlug]/bunshins/[bunshinId]/simple-first-post-setup.tsx',
        import.meta.url,
      ),
    );
    const source = await readFile(sourcePath, 'utf8');

    expect(source).toContain("goal: 'BRAND_AWARENESS'");
    expect(source).not.toMatch(/goal:\s*businessProfile\.primaryPurpose/u);
  });

  it('records that a goal-only change does not reach the weekly planner input', async () => {
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
        planner: { generate },
        providerModel: 'fake-no-network',
        resolveTimezone: vi.fn().mockResolvedValue('Asia/Tokyo'),
        recordUsage: vi.fn(),
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

    const normalized = captured.map((input) => JSON.stringify(input));
    expect(new Set(normalized)).toHaveLength(1);
    for (const input of captured as Array<{ approvedStrategy: Record<string, unknown> }>) {
      expect(input.approvedStrategy).not.toHaveProperty('goal');
    }
  });

  it('records that daily/content personalization carries the account goal only as a generic signal', () => {
    const goals: SocialAccountStrategyGoal[] = [
      'BRAND_AWARENESS',
      'INQUIRY',
      'SALES',
      'RECRUIT',
      'FOLLOWERS',
    ];

    const contexts = goals.map((goal) =>
      buildMissionPersonalizationContext({
        bunshin: {
          objectiveSummary: '美容室のSNS支援',
          audienceSummary: '地域の20〜40代',
          personalitySummary: '親しみやすく丁寧',
        },
        socialProfile: profile,
        strategy: strategy(goal),
        businessProfile: {
          industry: '美容室',
          businessName: 'サンプル美容室',
          region: '東京都',
          productService: 'カット・カラー',
          primaryPurpose: 'AWARENESS',
          targetAudience: '地域の20〜40代',
        },
      }),
    );

    contexts.forEach((context, index) => {
      const accountStrategy = context.signals.find(
        ({ type }: { type: string }) => type === 'ACCOUNT_STRATEGY',
      );
      expect(accountStrategy?.value).toContain(`目標: ${goals[index]}`);
      expect(context.instruction).not.toContain('職場環境');
      expect(context.instruction).not.toContain('問い合わせを促す');
      expect(context.instruction).not.toContain('再来店');
    });
  });
});
