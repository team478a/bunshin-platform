import { describe, expect, it, vi } from 'vitest';
import {
  CampaignSafetyValidationService,
  simhashSimilarityBasisPoints,
} from '../src/campaign-safety-validation';

const scope = {
  workspaceId: 'workspace-a',
  actorUserId: 'user-a',
  bunshinId: 'bunshin-a',
  campaignId: 'campaign-a',
  contentFingerprint: 'a'.repeat(64),
  simhash: '0000000000000000',
};

describe('Campaign safety validation', () => {
  it('calculates deterministic 64-bit similarity', () => {
    expect(simhashSimilarityBasisPoints('0000000000000000', '0000000000000000')).toBe(10000);
    expect(simhashSimilarityBasisPoints('0000000000000000', 'ffffffffffffffff')).toBe(0);
  });

  it('marks similar content without returning another participant identity or content', async () => {
    const service = new CampaignSafetyValidationService({
      inspect: vi.fn().mockResolvedValue({
        generationLimit: 60,
        generatedCount: 1,
        similarityThresholdBasisPoints: 8500,
        candidates: [{ simhash: '0000000000000000' }],
      }),
      record: vi.fn(),
    });
    await expect(service.inspect(scope)).resolves.toEqual({
      maxSimilarityBasisPoints: 10000,
      verdict: 'POSSIBLE_DUPLICATE',
    });
  });

  it('fails closed when the participant generation limit is reached', async () => {
    const service = new CampaignSafetyValidationService({
      inspect: vi.fn().mockResolvedValue({
        generationLimit: 2,
        generatedCount: 2,
        similarityThresholdBasisPoints: 8500,
        candidates: [],
      }),
      record: vi.fn(),
    });
    await expect(service.inspect(scope)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('fails closed across an unavailable workspace, user or Bunshin scope', async () => {
    const service = new CampaignSafetyValidationService({
      inspect: vi.fn().mockResolvedValue(null),
      record: vi.fn(),
    });
    await expect(service.inspect(scope)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
