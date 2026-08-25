import { ApplicationError } from '@bunshin/shared';

export interface CampaignSimilarityCandidate {
  simhash: string;
}

export interface CampaignSafetyRepository {
  inspect(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    campaignId: string;
    at: Date;
  }): Promise<{
    generationLimit: number;
    generatedCount: number;
    similarityThresholdBasisPoints: number;
    candidates: CampaignSimilarityCandidate[];
  } | null>;
  record(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    campaignId: string;
    dailyMissionId: string | null;
    contentFingerprint: string;
    simhash: string;
    maxSimilarityBasisPoints: number;
    verdict: 'UNIQUE' | 'POSSIBLE_DUPLICATE';
    at: Date;
  }): Promise<object | null>;
}

const bits = (value: string) => BigInt(`0x${value}`);
const bitCount = (value: bigint) => {
  let current = value;
  let count = 0;
  while (current) {
    count += Number(current & 1n);
    current >>= 1n;
  }
  return count;
};

export const simhashSimilarityBasisPoints = (left: string, right: string) => {
  if (!/^[0-9a-f]{16}$/.test(left) || !/^[0-9a-f]{16}$/.test(right))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid similarity signature');
  return Math.round(((64 - bitCount(bits(left) ^ bits(right))) / 64) * 10000);
};

export class CampaignSafetyValidationService {
  constructor(private readonly repository: CampaignSafetyRepository) {}

  async inspect(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    campaignId: string;
    contentFingerprint: string;
    simhash: string;
    at?: Date;
  }) {
    if (!/^[0-9a-f]{64}$/.test(input.contentFingerprint))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid content fingerprint');
    const state = await this.repository.inspect({ ...input, at: input.at ?? new Date() });
    if (!state) throw new ApplicationError('NOT_FOUND', 'campaign safety scope unavailable');
    if (state.generatedCount >= state.generationLimit)
      throw new ApplicationError('CONFLICT', 'campaign generation limit reached');
    const maxSimilarityBasisPoints = state.candidates.reduce(
      (maximum, candidate) =>
        Math.max(maximum, simhashSimilarityBasisPoints(input.simhash, candidate.simhash)),
      0,
    );
    return {
      maxSimilarityBasisPoints,
      verdict:
        maxSimilarityBasisPoints >= state.similarityThresholdBasisPoints
          ? ('POSSIBLE_DUPLICATE' as const)
          : ('UNIQUE' as const),
    };
  }

  async record(input: Parameters<CampaignSafetyRepository['record']>[0]) {
    const result = await this.repository.record(input);
    if (!result) throw new ApplicationError('NOT_FOUND', 'campaign safety scope unavailable');
    return result;
  }
}
