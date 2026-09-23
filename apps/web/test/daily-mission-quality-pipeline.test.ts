import type {
  CheckMissionQuality,
  GenerateMissionContent,
  MissionContentGeneratorInput,
  MissionQualityCheckerInput,
} from '@bunshin/capability-social';
import { describe, expect, it, vi } from 'vitest';
import { generateQualityCheckedMissionContent } from '../src/services/daily-mission-quality-pipeline';

const generationResult = (body: string) => ({
  output: { body },
  model: 'test-model',
  promptVersion: 'test-prompt',
  inputTokens: 10,
  outputTokens: 20,
  latencyMs: 5,
});

const qualityResult = (verdict: 'PASS' | 'REVISE') => ({
  output: {
    verdict,
    score: verdict === 'PASS' ? 90 : 50,
    issues:
      verdict === 'PASS'
        ? []
        : [
            {
              code: 'NEEDS_DETAIL',
              severity: 'ERROR' as const,
              field: 'body',
              message: '具体性が不足しています。',
              repairInstruction: '具体例を一つ追加する。',
            },
          ],
  },
  model: 'test-model',
  promptVersion: 'quality-prompt',
  inputTokens: 10,
  outputTokens: 10,
  latencyMs: 5,
});

const inputFor = (options: {
  generate: ReturnType<typeof vi.fn>;
  check: ReturnType<typeof vi.fn>;
  stages?: string[];
}) => ({
  generator: { execute: options.generate } as unknown as GenerateMissionContent,
  checker: { execute: options.check } as unknown as CheckMissionQuality,
  contentInput: {} as MissionContentGeneratorInput,
  qualityInput: ((content) => ({ content }) as MissionQualityCheckerInput) as (
    content: Record<string, unknown>,
  ) => MissionQualityCheckerInput,
  recentMissions: [],
  generateWithQuota: <T>(_suffix: string, generate: () => Promise<T>) => generate(),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  applyTerminology: <T>(result: T) => result,
  setStage: (stage: string) => options.stages?.push(stage),
});

describe('daily mission quality pipeline', () => {
  it('repairs revisable content and returns the passed result', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(generationResult('最初の投稿'))
      .mockResolvedValueOnce(generationResult('具体例を含む改善後の投稿'));
    const check = vi
      .fn()
      .mockResolvedValueOnce(qualityResult('REVISE'))
      .mockResolvedValueOnce(qualityResult('PASS'));
    const stages: string[] = [];

    const result = await generateQualityCheckedMissionContent(
      inputFor({ generate, check, stages }),
    );

    expect(result.content.output).toEqual({ body: '具体例を含む改善後の投稿' });
    expect(result.repairCount).toBe(1);
    expect(result.qualityIssueCodes).toEqual(['NEEDS_DETAIL']);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(check).toHaveBeenCalledTimes(2);
    expect(stages).toEqual(['content:0', 'quality:0', 'content:1', 'quality:1']);
  });

  it('stops after the bounded third quality rejection', async () => {
    const generate = vi.fn().mockResolvedValue(generationResult('修復対象の投稿'));
    const check = vi.fn().mockResolvedValue(qualityResult('REVISE'));

    await expect(
      generateQualityCheckedMissionContent(inputFor({ generate, check })),
    ).rejects.toMatchObject({ code: 'CONTENT_REJECTED' });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(check).toHaveBeenCalledTimes(3);
  });
});
