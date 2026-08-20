import { describe, expect, it } from 'vitest';
import { GenerateSocialAccountStrategy, type StrategyGeneratorPort } from '../src';
const input = {
  wizardTopic: 'topic',
  wizardAudience: 'audience',
  platform: 'X' as const,
  goal: 'FOLLOWERS' as const,
  availableMinutes: 5 as const,
  destinationType: 'PROFILE' as const,
  destinationDetail: null,
  bunshin: {
    name: 'b',
    objectiveSummary: 'o',
    audienceSummary: 'a',
    personalitySummary: 'p',
    objectives: [],
    audiences: [],
    personality: null,
  },
  grantedKnowledge: [],
};
describe('GenerateSocialAccountStrategy', () => {
  it('normalizes structured provider output', async () => {
    const provider: StrategyGeneratorPort = {
      generate: () =>
        Promise.resolve({
          output: {
            concept: ' concept ',
            positioning: ' position ',
            targetSummary: ' target ',
            profileDraft: ' profile ',
            ctaStrategy: ' cta ',
            postingPolicy: ' policy ',
          },
          model: 'test',
          promptVersion: 'v1',
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 1,
        }),
    };
    await expect(new GenerateSocialAccountStrategy(provider).execute(input)).resolves.toMatchObject(
      { output: { concept: 'concept', postingPolicy: 'policy' } },
    );
  });
  it('rejects incomplete output', async () => {
    const provider: StrategyGeneratorPort = {
      generate: () =>
        Promise.resolve({
          output: {
            concept: '',
            positioning: 'p',
            targetSummary: 't',
            profileDraft: 'd',
            ctaStrategy: 'c',
            postingPolicy: 'p',
          },
          model: 'test',
          promptVersion: 'v1',
          inputTokens: null,
          outputTokens: null,
          latencyMs: 1,
        }),
    };
    await expect(new GenerateSocialAccountStrategy(provider).execute(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
