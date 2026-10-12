import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordAiUsageInput } from '@bunshin/application';
const fake = vi.hoisted(() => ({
  record: vi.fn<(input: RecordAiUsageInput) => Promise<void>>(),
  content: vi.fn(),
  quality: vi.fn(),
  analyze: vi.fn(),
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: () =>
    Promise.resolve({
      apiKey: 'dummy',
      model: 'fake',
      requestCostUsdMicros: 10,
    }),
}));
vi.mock('../src/observability/ai-usage', () => ({ recordAiUsageSafely: fake.record }));
vi.mock('../src/organization-ai-generation-quota', () => ({
  withOrganizationAiGenerationQuota: async ({ generate }: { generate: () => Promise<unknown> }) =>
    generate(),
}));
// Only provider/use-case boundaries are faked. The runtime sequencing and usage recording execute.
vi.mock('@bunshin/capability-social', async (original) => ({
  ...(await original<object>()),
  GenerateMissionContent: class {
    execute = fake.content;
  },
  CheckMissionQuality: class {
    execute = fake.quality;
  },
}));
vi.mock('../src/providers/openai-photo-first-analyzer', () => ({
  OpenAiPhotoFirstAnalyzer: class {
    analyze = fake.analyze;
  },
  PhotoFirstAnalysisError: class extends Error {},
}));
import {
  createMissionContentVariantUsageState,
  generateMissionContentVariantWithAi,
} from '../src/services/mission-content-variant-ai-runtime';

const measurement = {
  model: 'fake-model',
  promptVersion: 'fake-stage',
  inputTokens: 2,
  outputTokens: 3,
  latencyMs: 4,
};
const photo = {
  ...measurement,
  analysis: {
    imageType: '架空写真',
    scene: '架空の店',
    subjects: [],
    objects: [],
    visibleText: [],
    uncertainElements: [],
    safetyFlags: [],
  },
  planning: {
    theme: '架空テーマ',
    angle: '架空切り口',
    recommendationReason: '架空理由',
    photoUsage: '写真を使う',
    confirmationQuestion: null,
  },
};
const generationId = '00000000-0000-4000-8000-000000000001';
function input() {
  return {
    generationId,
    scope: { workspaceId: 'workspace', bunshinId: 'bunshin', actorUserId: 'owner' },
    mission: {
      missionDate: '2026-10-03',
      weeklyPlanItemId: 'plan',
      content: { body: '架空原案' },
      format: 'TEXT',
    },
    recentMissions: [],
    context: {
      profile: { platform: 'X', id: 'profile' },
      bunshinContext: {},
      strategyContext: {},
      selectedMemories: [],
      knowledge: [],
      groupKnowledge: [],
    },
    usageIdempotencyPrefix: 'opaque-key-without-route',
    photoFirst: { bytes: new Uint8Array([1]), mimeType: 'image/png', sourceNote: '架空素材' },
    usageState: createMissionContentVariantUsageState(),
  } as unknown as Parameters<typeof generateMissionContentVariantWithAi>[0];
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('network forbidden');
    }),
  );
  fake.record.mockResolvedValue(undefined);
  fake.analyze.mockResolvedValue({ ...photo, promptVersion: 'photo-v3' });
  fake.content.mockResolvedValue({
    ...measurement,
    promptVersion: 'content-v18',
    output: { body: '架空投稿', hashtags: [], cta: null },
  });
  fake.quality.mockResolvedValue({
    ...measurement,
    promptVersion: 'quality-v13',
    output: { verdict: 'PASS', score: 90, issues: [] },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('variant runtime explicit usage provenance (fake boundaries, no network)', () => {
  it('links photo/content/check/repair/recheck stages to one generation and preserves each prompt', async () => {
    fake.quality.mockResolvedValueOnce({
      ...measurement,
      promptVersion: 'quality-v13',
      output: { verdict: 'REVISE', score: 60, issues: [{ repairInstruction: '架空修正' }] },
    });
    await generateMissionContentVariantWithAi(input());
    const events = fake.record.mock.calls.map(([event]) => event);
    expect(events.map((event) => event.taskType)).toEqual([
      'PHOTO_FIRST_ANALYSIS',
      'MISSION_CONTENT_VARIANT',
      'QUALITY_CHECKER',
      'MISSION_CONTENT_VARIANT_REPAIR',
      'QUALITY_CHECKER',
    ]);
    expect(events.map((event) => event.promptVersion)).toEqual([
      'photo-v3',
      'content-v18',
      'quality-v13',
      'content-v18',
      'quality-v13',
    ]);
    expect(events.every((event) => event.contentVariantGenerationId === generationId)).toBe(true);
    expect(new Set(events.map((event) => event.idempotencyKey)).size).toBe(5);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not invent a successful analysis or a zero-cost event when analysis fails before checking', async () => {
    fake.analyze.mockRejectedValueOnce(new Error('synthetic analysis failure'));
    await expect(generateMissionContentVariantWithAi(input())).rejects.toThrow(
      'synthetic analysis failure',
    );
    expect(fake.record).not.toHaveBeenCalled();
    expect(fake.content).not.toHaveBeenCalled();
    expect(fake.quality).not.toHaveBeenCalled();
  });
  it('keeps completed stages linked if the next quality call fails', async () => {
    fake.quality.mockRejectedValueOnce(new Error('synthetic checker failure'));
    await expect(generateMissionContentVariantWithAi(input())).rejects.toThrow(
      'synthetic checker failure',
    );
    expect(
      fake.record.mock.calls.map(([event]) => [event.taskType, event.contentVariantGenerationId]),
    ).toEqual([
      ['PHOTO_FIRST_ANALYSIS', generationId],
      ['MISSION_CONTENT_VARIANT', generationId],
    ]);
    expect(fake.content).toHaveBeenCalledOnce();
  });
});
