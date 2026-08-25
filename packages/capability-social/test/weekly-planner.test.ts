import { describe, expect, it, vi } from 'vitest';
import { GenerateWeeklyPlan, type WeeklyPlannerInput, type WeeklyPlannerOutput } from '../src';

const input: WeeklyPlannerInput = {
  weekStartDate: '2026-08-17',
  timezone: 'Asia/Tokyo',
  platform: 'X',
  availableMinutes: 5,
  bunshin: {
    name: 'BUNSHIN',
    objectiveSummary: '発信を継続する',
    audienceSummary: '副業初心者',
    personalitySummary: '丁寧',
  },
  approvedStrategy: {
    concept: '専門家型',
    positioning: '実践者',
    targetSummary: '副業初心者',
    ctaStrategy: 'プロフィール誘導',
    postingPolicy: '平日投稿',
  },
  contentPillars: [{ id: 'pillar-1', title: '実践', description: null, weight: 100 }],
  grantedKnowledge: [],
  campaigns: [],
};

const output: WeeklyPlannerOutput = {
  strategySummary: ' 今週は実践を伝える ',
  items: [
    {
      scheduledDate: '2026-08-17',
      contentPillarId: 'pillar-1',
      goal: ' 共感を得る ',
      angle: ' 失敗談 ',
      recommendedFormat: 'TEXT',
      notes: ' ',
      campaignId: null,
      classification: 'ORGANIC',
    },
  ],
};

function planner(value: WeeklyPlannerOutput) {
  return {
    generate: vi.fn().mockResolvedValue({
      output: value,
      model: 'gpt-5.2',
      promptVersion: 'weekly-planner-v1',
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 30,
    }),
  };
}

describe('GenerateWeeklyPlan', () => {
  it('validates and normalizes a structured weekly plan', async () => {
    const result = await new GenerateWeeklyPlan(planner(output)).execute(input);
    expect(result.output).toEqual({
      strategySummary: '今週は実践を伝える',
      items: [{ ...output.items[0], goal: '共感を得る', angle: '失敗談', notes: null }],
    });
  });

  it.each([
    ['outside week', { ...output, items: [{ ...output.items[0]!, scheduledDate: '2026-08-24' }] }],
    [
      'duplicate date',
      { ...output, items: [output.items[0]!, { ...output.items[0]!, goal: '別の目的' }] },
    ],
    [
      'unknown pillar',
      { ...output, items: [{ ...output.items[0]!, contentPillarId: 'outside-scope' }] },
    ],
  ])('rejects %s from the provider', async (_name, invalid) => {
    await expect(new GenerateWeeklyPlan(planner(invalid)).execute(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('does not invoke the provider without active pillars', async () => {
    const provider = planner(output);
    await expect(
      new GenerateWeeklyPlan(provider).execute({ ...input, contentPillars: [] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  const campaign = {
    id: 'campaign-1',
    name: '公式企画',
    theme: '商品の正しい使い方',
    targetSummary: '初心者',
    startsAt: new Date('2026-08-01T00:00:00Z'),
    endsAt: new Date('2026-09-01T00:00:00Z'),
    maxRelatedPerWeek: 2,
    maxAdsPerWeek: 1,
    cooldownDays: 2,
    productPack: {
      productPackId: 'pack-1',
      groupId: 'group-1',
      versionId: 'version-1',
      version: 1,
      allowLinklessPosts: false,
      summary: '公式商品',
      providerName: '公式店',
      targetCustomer: '初心者',
      facts: { price: '1000円' },
      rules: [],
      assets: [],
    },
  };

  it('商品投稿の週上限をサーバー側で拒否する', async () => {
    const campaignItem = {
      ...output.items[0]!,
      campaignId: campaign.id,
      classification: 'ADVERTISEMENT' as const,
    };
    await expect(
      new GenerateWeeklyPlan(
        planner({
          ...output,
          items: [campaignItem, { ...campaignItem, scheduledDate: '2026-08-21' }],
        }),
      ).execute({ ...input, campaigns: [campaign] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('商品投稿を近い日に連続させない', async () => {
    const campaignItem = {
      ...output.items[0]!,
      campaignId: campaign.id,
      classification: 'PRODUCT_RELATED' as const,
    };
    await expect(
      new GenerateWeeklyPlan(
        planner({
          ...output,
          items: [campaignItem, { ...campaignItem, scheduledDate: '2026-08-18' }],
        }),
      ).execute({ ...input, campaigns: [campaign] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
