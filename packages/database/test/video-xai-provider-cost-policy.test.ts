import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/client';
import { PrismaVideoAiProviderCostPolicyRepository } from '../src/provider-configurations';

describe('xAI video provider cost policy', () => {
  it('resolves the video capability and converts per-second price to the ten-second scene guard', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      provider: 'XAI',
      model: 'grok-imagine-video-1.5',
      globallyPaused: false,
      dailyBudgetUsdMicros: 5_000_000,
      monthlyBudgetUsdMicros: 20_000_000,
      requestCostUsdMicros: 140_000,
    });
    const aggregate = vi.fn().mockResolvedValue({ _sum: { estimatedCostUsdMicros: 700_000 } });
    const repository = new PrismaVideoAiProviderCostPolicyRepository({
      aiProviderConfiguration: { findFirst },
      videoSceneGeneration: { aggregate },
    } as unknown as PrismaClient);
    const now = new Date('2026-11-18T00:00:00Z');

    await expect(
      repository.findActive({
        environment: 'DEVELOPMENT',
        provider: 'XAI',
        model: 'grok-imagine-video-1.5',
        dailyFrom: now,
        monthlyFrom: now,
        now: new Date('2026-11-18T12:00:00Z'),
      }),
    ).resolves.toEqual({
      policy: {
        provider: 'XAI',
        model: 'grok-imagine-video-1.5',
        globallyPaused: false,
        dailyBudgetUsdMicros: 5_000_000,
        monthlyBudgetUsdMicros: 20_000_000,
        maxSceneCostUsdMicros: 1_400_000,
      },
      dailySpentUsdMicros: 700_000,
      monthlySpentUsdMicros: 700_000,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        provider: 'XAI',
        model: 'grok-imagine-video-1.5',
        capabilityKey: 'VIDEO_SCENE_GENERATION',
      }),
    });
  });
});
