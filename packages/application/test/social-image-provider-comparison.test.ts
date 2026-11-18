import { describe, expect, it } from 'vitest';
import {
  SOCIAL_IMAGE_COMPARISON_INDUSTRIES,
  SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES,
  aggregateSocialImageProviderComparison,
  selectSocialImageProvider,
} from '../src/social-image-provider-comparison';

describe('social image provider comparison', () => {
  it('contains five synthetic cases for each of the four required industries', () => {
    expect(SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES).toHaveLength(20);
    for (const industry of SOCIAL_IMAGE_COMPARISON_INDUSTRIES) {
      expect(
        SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES.filter((item) => item.industry === industry),
      ).toHaveLength(5);
    }
    expect(
      new Set(SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES.map((item) => item.caseKey)).size,
    ).toBe(20);
    expect(
      SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES.every(
        (item) =>
          item.observations.length === 2 &&
          item.observations.some((row) => row.provider === 'OPENAI') &&
          item.observations.some((row) => row.provider === 'XAI'),
      ),
    ).toBe(true);
  });

  it('aggregates all eight requested comparison dimensions without treating failures as ratings', () => {
    const aggregates = aggregateSocialImageProviderComparison(
      SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES,
    );
    expect(aggregates).toHaveLength(2);
    for (const aggregate of aggregates) {
      expect(aggregate.caseCount).toBe(20);
      expect(aggregate.successfulCases).toBe(19);
      expect(aggregate.successRate).toBe(95);
      expect(aggregate.averageImageQuality).toBeGreaterThanOrEqual(1);
      expect(aggregate.averageJapaneseLegibility).toBeGreaterThanOrEqual(1);
      expect(aggregate.averageBrandFit).toBeGreaterThanOrEqual(1);
      expect(aggregate.averagePersonConsistency).not.toBeNull();
      expect(aggregate.averageLatencyMs).toBeGreaterThan(0);
      expect(aggregate.averageCostUsdMicros).toBeGreaterThan(0);
      expect(aggregate.regenerationRate).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects stopped, unsupported, over-budget and low-quality providers before ranking', () => {
    const [openai, xai] = aggregateSocialImageProviderComparison(
      SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES,
    );
    const result = selectSocialImageProvider(
      [
        {
          ...openai!,
          active: false,
          configured: true,
          features: ['TEXT_TO_IMAGE', 'REFERENCE_IMAGE', 'PERSON_CONSISTENCY'],
        },
        {
          ...xai!,
          active: true,
          configured: true,
          features: ['TEXT_TO_IMAGE'],
        },
      ],
      {
        requiredFeatures: ['REFERENCE_IMAGE'],
        maximumCostUsdMicros: 65_000,
        minimumQualityScore: 4,
        minimumSuccessRate: 90,
      },
    );
    expect(result.selectedProvider).toBeNull();
    expect(result.rejected.find((item) => item.provider === 'OPENAI')?.reasons).toContain(
      'STOPPED',
    );
    expect(result.rejected.find((item) => item.provider === 'OPENAI')?.reasons).toContain(
      'COST_LIMIT_EXCEEDED',
    );
    expect(result.rejected.find((item) => item.provider === 'XAI')?.reasons).toContain(
      'FEATURE_UNSUPPORTED',
    );
  });

  it('uses deterministic quality, success, regeneration, cost, latency and provider tie breaks', () => {
    const base = {
      caseCount: 20,
      successfulCases: 20,
      successRate: 100,
      averageImageQuality: 4,
      averageJapaneseLegibility: 4,
      averageBrandFit: 4,
      averagePersonConsistency: 4,
      averageQualityScore: 4,
      averageLatencyMs: 5_000,
      averageCostUsdMicros: 60_000,
      regenerationRate: 5,
      active: true,
      configured: true,
      features: ['TEXT_TO_IMAGE'] as const,
    };
    const result = selectSocialImageProvider(
      [
        { ...base, provider: 'XAI' },
        { ...base, provider: 'OPENAI' },
      ],
      {
        requiredFeatures: ['TEXT_TO_IMAGE'],
        maximumCostUsdMicros: 100_000,
        minimumQualityScore: 3,
        minimumSuccessRate: 90,
      },
    );
    expect(result.selectedProvider).toBe('OPENAI');
    expect(result.eligibleProviders).toEqual(['OPENAI', 'XAI']);
  });
});
