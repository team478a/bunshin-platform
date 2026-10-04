import { describe, expect, it, vi } from 'vitest';

import {
  decideSocialDecisionRepair,
  prepareSocialDecisionRebrief,
  socialGoalPlanningProfile,
  type DailyMissionBrief,
  type DailyMissionPlannerProviderInput,
} from '@bunshin/capability-social';

import { OpenAIDailyMissionRebriefPlanner } from '../src/providers/openai-daily-mission-rebrief-planner';

const planningContext = {
  missionDate: '2026-10-04',
  timezone: 'Asia/Tokyo',
  platform: 'INSTAGRAM',
  availableMinutes: 10,
  bunshin: {
    name: '投稿パートナー',
    objectiveSummary: '問い合わせを増やす',
    audienceSummary: '相談前の顧客',
    personalitySummary: '丁寧',
    personality: {
      versionId: 'personality-version-internal',
      version: 2,
      tone: 'やさしい',
      formality: 'ふつう',
      energyLevel: '落ち着いている',
      expertiseLevel: '初心者向け',
      sentenceStyle: '短い文',
      firstPerson: 'わたし',
      forbiddenExpressions: ['絶対'],
      preferredExpressions: ['いっしょに'],
      visualDirection: null,
      facePolicy: 'FULL_ANONYMOUS',
    },
  },
  approvedStrategy: {
    goal: 'INQUIRY',
    goalPlanning: socialGoalPlanningProfile('INQUIRY'),
    concept: '相談しやすさ',
    positioning: '伴走者',
    targetSummary: '初めて相談する人',
    ctaStrategy: '問い合わせ',
    postingPolicy: '事実に基づく',
  },
  weeklyPlanStrategySummary: '相談前の不安を減らす',
  weeklyItem: {
    goal: '相談前の不安を減らす',
    angle: '初回相談の流れ',
    recommendedFormat: 'SLIDE',
    notes: null,
    campaignId: 'campaign-internal',
    classification: 'ADVERTISEMENT',
    businessContentCategory: 'FAQ_PROBLEM',
  },
  campaign: {
    id: 'campaign-internal',
    name: '相談会',
    theme: '初回相談',
    targetSummary: '初めて相談する人',
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    endsAt: new Date('2026-10-31T00:00:00.000Z'),
    maxRelatedPerWeek: 2,
    maxAdsPerWeek: 1,
    cooldownDays: 2,
    productPack: {
      productPackId: 'product-pack-internal',
      groupId: 'group-internal',
      versionId: 'pack-version-internal',
      version: 3,
      allowLinklessPosts: false,
      summary: '初回相談会',
      providerName: '相談サービス',
      targetCustomer: '初めて相談する人',
      facts: { duration: '30分' },
      rules: [{ type: 'DISCLOSURE', value: '#PR', condition: null }],
      assets: [
        {
          type: 'IMAGE',
          url: 'https://internal.example/asset-secret',
          label: '公式画像',
          usageTerms: '改変不可',
        },
      ],
    },
  },
  contentPillar: { title: '相談の流れ', description: '初めての方向け' },
  grantedKnowledge: [{ type: 'FACT', title: '所要時間', content: '初回相談は30分' }],
  personalization: {
    signals: [{ type: 'ACCOUNT_STRATEGY', label: '現在のSNS目的', value: 'INQUIRY' }],
    instruction: '承認済み目的を優先する',
  },
} satisfies DailyMissionPlannerProviderInput;

const previousBrief: DailyMissionBrief = {
  missionDate: planningContext.missionDate,
  socialProfileId: 'profile-internal',
  weeklyPlanItemId: 'weekly-item-internal',
  format: 'SLIDE',
  topic: '相談前に知っておきたいこと',
  angle: '3つの準備',
  reason: '相談前の不安を減らすため',
  estimatedMinutes: 10,
  campaignId: 'campaign-internal',
  classification: 'ADVERTISEMENT',
  personalizationSourceTypes: ['ACCOUNT_STRATEGY'],
  personalizationReason: '問い合わせ目的に沿うため',
};

const revision = prepareSocialDecisionRebrief({
  attempt: 1,
  boundary: {
    authorization: 'PASSED',
    capability: 'PASSED',
    ownership: 'PASSED',
    safetyLegal: 'PASSED',
  },
  disposition: decideSocialDecisionRepair({
    qualityVerdict: 'REVISE',
    qualityIssueCodes: ['GOAL_MISMATCH'],
    contentInspectionIssue: null,
  }),
  constraints: {
    missionDate: planningContext.missionDate,
    timezone: planningContext.timezone,
    platform: planningContext.platform,
    currentGoal: planningContext.approvedStrategy.goal,
    strategyVersion: 3,
    weeklyGoal: planningContext.weeklyItem.goal,
    weeklyAngle: planningContext.weeklyItem.angle,
    format: planningContext.weeklyItem.recommendedFormat,
    availableMinutes: planningContext.availableMinutes,
    campaignId: planningContext.weeklyItem.campaignId,
    classification: planningContext.weeklyItem.classification,
  },
  previousBrief,
});

function successResponse(
  output: Record<string, unknown> = {
    topic: '初回相談で最初に確認すること',
    angle: '当日の流れを時系列で説明する',
    reason: '問い合わせ前の不安を具体的に減らすため',
    estimatedMinutes: 10,
    personalizationSourceTypes: ['ACCOUNT_STRATEGY'],
    personalizationReason: '現在の問い合わせ目的を判断軸にしたため',
  },
) {
  return new Response(
    JSON.stringify({
      model: 'gpt-5.2',
      usage: { input_tokens: 100, output_tokens: 40 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
    }),
    { status: 200 },
  );
}

describe('OpenAIDailyMissionRebriefPlanner', () => {
  it('projects a strict rebrief request without internal identifiers, asset URLs or post content', async () => {
    const fetcher = vi.fn().mockResolvedValue(successResponse());
    const result = await new OpenAIDailyMissionRebriefPlanner({
      apiKey: 'test-key',
      fetch: fetcher,
    }).generate({ planningContext, revision });

    expect(result).toMatchObject({
      promptVersion: 'daily-mission-rebrief-v1',
      output: { topic: '初回相談で最初に確認すること' },
    });
    const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
      store: boolean;
      input: Array<{ content: string }>;
      text: { format: { strict: boolean; schema: { properties: Record<string, unknown> } } };
    };
    const providerJson = request.input[1]?.content ?? '';
    expect(request.store).toBe(false);
    expect(request.text.format.strict).toBe(true);
    expect(Object.keys(request.text.format.schema.properties)).toEqual([
      'topic',
      'angle',
      'reason',
      'estimatedMinutes',
      'personalizationSourceTypes',
      'personalizationReason',
    ]);
    expect(providerJson).toContain('GOAL_MISMATCH');
    expect(providerJson).toContain('初回相談は30分');
    expect(providerJson).not.toMatch(
      /personality-version-internal|campaign-internal|product-pack-internal|group-internal|pack-version-internal|profile-internal|weekly-item-internal|asset-secret/,
    );
    expect(providerJson).not.toContain('caption');
  });

  it('rejects planning drift before calling the provider', async () => {
    const fetcher = vi.fn();
    const planner = new OpenAIDailyMissionRebriefPlanner({
      apiKey: 'test-key',
      fetch: fetcher,
    });
    await expect(
      planner.generate({
        planningContext: { ...planningContext, availableMinutes: 5 },
        revision,
      }),
    ).rejects.toThrow('rebrief planning context changed after preparation');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an unavailable or repeated personalization source in provider output', async () => {
    const planner = new OpenAIDailyMissionRebriefPlanner({
      apiKey: 'test-key',
      fetch: vi.fn().mockResolvedValue(
        successResponse({
          topic: 'topic',
          angle: 'angle',
          reason: 'reason',
          estimatedMinutes: 10,
          personalizationSourceTypes: ['USER_MEMORY', 'USER_MEMORY'],
          personalizationReason: 'reason',
        }),
      ),
    });
    await expect(planner.generate({ planningContext, revision })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('maps provider failures without exposing the response or API key', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'rate_limit', message: 'provider-secret' } }), {
        status: 429,
      }),
    );
    const error = await new OpenAIDailyMissionRebriefPlanner({
      apiKey: 'api-secret',
      fetch: fetcher,
    })
      .generate({ planningContext, revision })
      .catch((value: unknown) => value);
    expect(error).toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      cause: { providerErrorCode: 'rate_limit', httpStatus: 429 },
    });
    expect(JSON.stringify(error)).not.toContain('provider-secret');
    expect(JSON.stringify(error)).not.toContain('api-secret');
  });
});
