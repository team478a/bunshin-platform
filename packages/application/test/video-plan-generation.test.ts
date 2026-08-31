import { describe, expect, it, vi } from 'vitest';
import {
  GenerateVideoPlan,
  type VideoPlanGeneratorPort,
  type VideoPlanningContextRepository,
  type VideoProjectRecord,
  type VideoProjectRepository,
} from '../src';

const ids = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  groupMembershipId: '33333333-3333-4333-8333-333333333333',
  actorUserId: '44444444-4444-4444-8444-444444444444',
  bunshinId: '55555555-5555-4555-8555-555555555555',
  videoProjectId: '66666666-6666-4666-8666-666666666666',
};
const now = new Date('2026-08-27T00:00:00Z');
const project: VideoProjectRecord = {
  id: ids.videoProjectId,
  workspaceId: ids.workspaceId,
  groupId: ids.groupId,
  groupMembershipId: ids.groupMembershipId,
  ownerUserId: ids.actorUserId,
  bunshinId: ids.bunshinId,
  campaignId: null,
  characterProfileVersionId: null,
  characterProfileSnapshot: {},
  characterReferenceSnapshot: [],
  title: '30秒の商品紹介',
  platform: 'INSTAGRAM',
  type: 'PRODUCT_INTRODUCTION',
  durationSeconds: 30,
  status: 'DRAFT',
  revision: 1,
  aiProcessingTypes: [],
  disclosureSnapshot: {},
  standardComposition: true,
  aiVideoSceneCount: 0,
  scenes: [],
  createdAt: now,
  updatedAt: now,
};

const contextRepository = (): VideoPlanningContextRepository => ({
  findAuthorized: vi.fn().mockResolvedValue({
    objective: '商品の特徴をわかりやすく伝える',
    audience: '初めて商品を知る人',
    personality: {
      tone: 'やさしい',
      preferredExpressions: ['いっしょに'],
      prohibitedExpressions: ['絶対'],
    },
    product: {
      name: '公式商品',
      facts: ['内容量100g'],
      requiredDisclosures: ['#PR'],
      prohibitedExpressions: ['必ず成功'],
    },
    approvedAssets: [{ assetId: 'asset-1', description: '商品正面写真' }],
    userAssets: [{ assetId: 'user-asset-1', kind: 'IMAGE', description: '本人の商品写真' }],
  }),
});

const generatedScenes = () =>
  Array.from({ length: 5 }, (_, index) => ({
    sceneNo: index + 1,
    durationMs: 6_000,
    narration: `場面${index + 1}の説明`,
    caption: `場面${index + 1}`,
    visualType: 'TEXT_MOTION' as const,
    visualPrompt: null,
    keywords: ['商品'],
    aiProcessingTypes: ['SCRIPT_GENERATION'] as const,
  }));

const generator = (): VideoPlanGeneratorPort => ({
  generate: vi.fn().mockResolvedValue({
    output: {
      scenes: generatedScenes(),
      projectAiProcessingTypes: ['SCRIPT_GENERATION'],
    },
    model: 'gpt-5.2',
    promptVersion: 'video-plan-v1',
    inputTokens: 100,
    outputTokens: 200,
    latencyMs: 50,
  }),
});

const projectRepository = (): VideoProjectRepository => ({
  create: vi.fn(),
  findOwned: vi.fn().mockResolvedValue(project),
  replacePlan: vi.fn().mockResolvedValue({
    ...project,
    status: 'WAITING_APPROVAL',
    revision: 2,
  }),
  approvePlan: vi.fn(),
});

describe('GenerateVideoPlan', () => {
  const input = {
    workspaceId: ids.workspaceId,
    groupId: ids.groupId,
    actorUserId: ids.actorUserId,
    videoProjectId: ids.videoProjectId,
    expectedRevision: 1,
  };

  it('generates only after project and authorized context isolation checks', async () => {
    const projects = projectRepository();
    const contexts = contextRepository();
    const provider = generator();
    const result = await new GenerateVideoPlan(projects, contexts, provider).execute(input);
    expect(result).toMatchObject({
      project: { status: 'WAITING_APPROVAL', revision: 2 },
      generation: { model: 'gpt-5.2', promptVersion: 'video-plan-v1' },
    });
    // Repository methods are Vitest mocks in this test.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(contexts.findAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        bunshinId: ids.bunshinId,
      }),
    );
  });

  it('does not call the provider when the project is outside the caller scope', async () => {
    const projects = projectRepository();
    projects.findOwned = vi.fn().mockResolvedValue(null);
    const provider = generator();
    await expect(
      new GenerateVideoPlan(projects, contextRepository(), provider).execute(input),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('does not call the provider when an authorized context cannot be built', async () => {
    const contexts = contextRepository();
    contexts.findAuthorized = vi.fn().mockResolvedValue(null);
    const provider = generator();
    await expect(
      new GenerateVideoPlan(projectRepository(), contexts, provider).execute(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('rejects invalid provider output before persistence', async () => {
    const projects = projectRepository();
    const provider = generator();
    provider.generate = vi.fn().mockResolvedValue({
      output: {
        scenes: generatedScenes().map((scene, index) => ({
          ...scene,
          durationMs: index === 0 ? 5_000 : 6_000,
        })),
        projectAiProcessingTypes: ['SCRIPT_GENERATION'],
      },
      model: 'gpt-5.2',
      promptVersion: 'video-plan-v1',
      inputTokens: null,
      outputTokens: null,
      latencyMs: 50,
    });
    await expect(
      new GenerateVideoPlan(projects, contextRepository(), provider).execute(input),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(projects.replacePlan).not.toHaveBeenCalled();
  });
});
