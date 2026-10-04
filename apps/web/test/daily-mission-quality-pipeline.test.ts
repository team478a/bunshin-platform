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
  decisionRepairPolicy: 'ALLOW_CONTENT_REPAIR' as const,
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

  it('fails closed before repairing content that requires a new decision brief', async () => {
    const generate = vi
      .fn()
      .mockResolvedValue(generationResult('判断理由と一致するか未確認の投稿'));
    const check = vi.fn().mockResolvedValue(qualityResult('REVISE'));

    await expect(
      generateQualityCheckedMissionContent({
        ...inputFor({ generate, check }),
        decisionRepairPolicy: 'REQUIRE_REBRIEF',
      }),
    ).rejects.toMatchObject({
      code: 'CONTENT_REJECTED',
      cause: {
        reason: 'DECISION_REBRIEF_REQUIRED',
        issueCodes: ['NEEDS_DETAIL'],
        attempts: 1,
      },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('fails closed before replacing a passed but duplicated decision-aligned proposal', async () => {
    const generate = vi.fn().mockResolvedValue(generationResult('以前と同じ投稿'));
    const check = vi.fn().mockResolvedValue(qualityResult('PASS'));

    await expect(
      generateQualityCheckedMissionContent({
        ...inputFor({ generate, check }),
        decisionRepairPolicy: 'REQUIRE_REBRIEF',
        recentMissions: [
          {
            missionDate: '2026-10-03',
            topic: '以前のテーマ',
            angle: '以前の切り口',
            content: { body: '以前と同じ投稿' },
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'CONTENT_REJECTED',
      cause: {
        reason: 'DECISION_REBRIEF_REQUIRED',
        noveltyIssue: { code: 'EXACT_RECENT_CONTENT' },
        attempts: 1,
      },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
