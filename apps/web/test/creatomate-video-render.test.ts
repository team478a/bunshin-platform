import { describe, expect, it, vi } from 'vitest';
import type { VideoProjectRecord } from '@bunshin/application';
import {
  buildCreatomateRenderScript,
  classifyCreatomateStatus,
  CreatomateVideoRenderAdapter,
  VideoRenderProviderError,
} from '../src/providers/creatomate-video-render';

const project = (): VideoProjectRecord => ({
  id: '10000000-0000-4000-8000-000000000001',
  workspaceId: '10000000-0000-4000-8000-000000000002',
  groupId: '10000000-0000-4000-8000-000000000003',
  groupMembershipId: '10000000-0000-4000-8000-000000000004',
  ownerUserId: '10000000-0000-4000-8000-000000000005',
  bunshinId: '10000000-0000-4000-8000-000000000006',
  campaignId: null,
  characterProfileVersionId: '10000000-0000-4000-8000-000000000007',
  characterProfileSnapshot: { name: '案内役ミナ', version: 1 },
  characterReferenceSnapshot: [
    {
      id: '10000000-0000-4000-8000-000000000008',
      storageKey: 'private/character-reference.png',
      sha256: 'a'.repeat(64),
      mimeType: 'image/png',
    },
  ],
  title: '動画',
  platform: 'INSTAGRAM',
  type: 'EXPLAINER',
  durationSeconds: 30,
  status: 'APPROVED',
  revision: 2,
  aiProcessingTypes: ['SCRIPT_GENERATION'],
  disclosureSnapshot: {},
  standardComposition: true,
  aiVideoSceneCount: 0,
  scenes: Array.from({ length: 5 }, (_, index) => ({
    id: `20000000-0000-4000-8000-00000000000${index + 1}`,
    videoProjectId: '10000000-0000-4000-8000-000000000001',
    sceneNo: index + 1,
    durationMs: 6_000,
    narration: `説明${index + 1}`,
    caption: `画面${index + 1}`,
    visualType: 'TEXT_MOTION',
    visualPrompt: null,
    keywords: [],
    aiProcessingTypes: [],
    locked: false,
    revision: 1,
    createdAt: new Date('2026-08-27T00:00:00Z'),
    updatedAt: new Date('2026-08-27T00:00:00Z'),
  })),
  createdAt: new Date('2026-08-27T00:00:00Z'),
  updatedAt: new Date('2026-08-27T00:00:00Z'),
});

describe('Creatomate video render adapter', () => {
  it.each(['APPROVED_ASSET', 'STOCK_IMAGE'] as const)(
    'rejects unsupported %s instead of silently rendering a blank background',
    (visualType) => {
      const value = project();
      value.scenes[0]!.visualType = visualType;
      expect(() => buildCreatomateRenderScript(value)).toThrow('写真・音声');
    },
  );
  it('turns five adopted carousel pages into a 25-second vertical slideshow', () => {
    const value = project();
    value.durationSeconds = 25;
    value.type = 'PHOTO_SLIDESHOW';
    value.scenes = value.scenes.map((scene, index) => ({
      ...scene,
      durationMs: 5_000,
      visualType: 'GENERATED_IMAGE',
      keywords: [`30000000-0000-4000-8000-00000000000${index + 1}`],
    }));
    const sources = value.scenes.map((scene, index) => ({
      videoSceneId: scene.id,
      url: `https://storage.example/page-${index + 1}.png?token=short`,
    }));
    const script = buildCreatomateRenderScript(value, [], [], undefined, sources);
    expect(script).toMatchObject({ width: 1080, height: 1920, duration: 25 });
    expect(script.elements.filter((element) => element.type === 'image')).toHaveLength(10);
    expect(script.elements.filter((element) => element.type === 'text')).toHaveLength(0);
    expect(script.elements).toContainEqual(
      expect.objectContaining({
        type: 'image',
        fit: 'contain',
        source: sources[0]!.url,
        animations: expect.arrayContaining([expect.objectContaining({ type: 'scale' })]),
      }),
    );
  });

  it('fails closed when a generated carousel scene has no signed source', () => {
    const value = project();
    value.scenes[0] = { ...value.scenes[0]!, visualType: 'GENERATED_IMAGE' };
    expect(() => buildCreatomateRenderScript(value)).toThrow(VideoRenderProviderError);
  });
  it('rejects a voice promise before submitting a silent video', () => {
    const value = project();
    value.aiProcessingTypes = ['VOICE_SYNTHESIS'];
    expect(() => buildCreatomateRenderScript(value)).toThrow(VideoRenderProviderError);
  });
  it('composes an owned photo and generated narration from short-lived URLs', () => {
    const value = project();
    const firstScene = value.scenes[0]!;
    value.photoAssetIds = ['30000000-0000-4000-8000-000000000001'];
    value.narrationEnabled = true;
    value.aiProcessingTypes = ['SCRIPT_GENERATION', 'VOICE_SYNTHESIS'];
    value.scenes[0] = {
      ...firstScene,
      visualType: 'USER_ASSET',
      keywords: [value.photoAssetIds[0]!],
    };
    const script = buildCreatomateRenderScript(
      value,
      [],
      [{ videoSceneId: firstScene.id, url: 'https://storage.example/photo.jpg?token=short' }],
      'https://storage.example/narration.wav?token=short',
    );
    expect(script.elements).toContainEqual(
      expect.objectContaining({
        type: 'image',
        source: 'https://storage.example/photo.jpg?token=short',
      }),
    );
    expect(script.elements).toContainEqual(
      expect.objectContaining({
        type: 'audio',
        source: 'https://storage.example/narration.wav?token=short',
      }),
    );
    expect(script.elements).toContainEqual(expect.objectContaining({ text: 'AI音声' }));
  });

  it('fails closed when an owned-photo scene has no signed source', () => {
    const value = project();
    value.scenes[0] = { ...value.scenes[0]!, visualType: 'USER_ASSET' };
    expect(() => buildCreatomateRenderScript(value)).toThrow(VideoRenderProviderError);
  });
  it('maps an approved standard plan to a vertical RenderScript without personal metadata', () => {
    const script = buildCreatomateRenderScript(project());
    expect(script).toMatchObject({ output_format: 'mp4', width: 1080, height: 1920, duration: 30 });
    expect(script.elements).toHaveLength(10);
    expect(JSON.stringify(script)).not.toContain('ownerUserId');
    expect(JSON.stringify(script)).not.toContain('説明1');
    expect(JSON.stringify(script)).not.toContain('private/character-reference.png');
  });

  it('composes AI video scenes from short-lived source URLs', () => {
    const value = project();
    value.standardComposition = false;
    value.aiVideoSceneCount = 1;
    const firstScene = value.scenes[0];
    if (!firstScene) throw new Error('AI scene fixture is required');
    const aiScene: VideoProjectRecord['scenes'][number] = {
      ...firstScene,
      visualType: 'AI_VIDEO',
      aiProcessingTypes: ['VIDEO_GENERATION'],
    };
    value.scenes[0] = aiScene;
    const script = buildCreatomateRenderScript(value, [
      {
        videoSceneId: aiScene.id,
        url: 'https://storage.example/signed-scene.mp4?token=short',
      },
    ]);
    expect(script.elements[0]).toMatchObject({
      type: 'video',
      source: 'https://storage.example/signed-scene.mp4?token=short',
      volume: '0%',
    });
  });

  it('fails closed when an AI scene has no generated source', () => {
    const value = project();
    value.standardComposition = false;
    value.aiVideoSceneCount = 1;
    const firstScene = value.scenes[0];
    if (!firstScene) throw new Error('AI scene fixture is required');
    value.scenes[0] = {
      ...firstScene,
      visualType: 'AI_VIDEO',
      aiProcessingTypes: ['VIDEO_GENERATION'],
    };
    expect(() => buildCreatomateRenderScript(value)).toThrow(VideoRenderProviderError);
  });

  it.each([
    [401, 'AUTHENTICATION', false],
    [402, 'QUOTA', false],
    [429, 'RATE_LIMIT', true],
    [500, 'PROVIDER_ERROR', true],
  ])('classifies status %i', (status, category, retryable) => {
    expect(classifyCreatomateStatus(status)).toMatchObject({ category, retryable, status });
  });

  it('submits RenderScript and only sends the internal render id as metadata', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'render-123', status: 'planned' }), { status: 201 }),
      );
    const adapter = new CreatomateVideoRenderAdapter('secret', request);
    await expect(
      adapter.submit({
        renderId: '30000000-0000-4000-8000-000000000001',
        project: project(),
        aiSceneSources: [],
        webhookUrl: 'https://app.example/api/video-renders/webhook?state=opaque',
      }),
    ).resolves.toEqual({ externalJobId: 'render-123' });
    const init = request.mock.calls[0]?.[1] as RequestInit;
    expect(typeof init.body).toBe('string');
    const serialized = typeof init.body === 'string' ? init.body : '';
    const body = JSON.parse(serialized) as Record<string, unknown>;
    expect(body.metadata).toBe('30000000-0000-4000-8000-000000000001');
    expect(body.webhook_url).toBe('https://app.example/api/video-renders/webhook?state=opaque');
    expect(serialized).not.toContain('10000000-0000-4000-8000-000000000005');
    expect(serialized).not.toContain('private/character-reference.png');
  });

  it('maps provider progress and accepts only the Creatomate output host', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'render-123',
          status: 'succeeded',
          url: 'https://cdn.creatomate.com/renders/render-123.mp4',
        }),
      ),
    );
    const adapter = new CreatomateVideoRenderAdapter('secret', request);
    await expect(adapter.inspect({ externalJobId: 'render-123' })).resolves.toEqual({
      status: 'SUCCEEDED',
      outputUrl: 'https://cdn.creatomate.com/renders/render-123.mp4',
    });
  });

  it('accepts the Creatomate-managed Backblaze delivery URL used by trial renders', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'render-123',
          status: 'succeeded',
          url: 'https://f002.backblazeb2.com/file/creatomate-example/render-123.mp4',
        }),
      ),
    );
    await expect(
      new CreatomateVideoRenderAdapter('secret', request).inspect({
        externalJobId: 'render-123',
      }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
  });

  it('rejects an unexpected output host', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: 'succeeded', url: 'https://attacker.example/video.mp4' }),
        ),
      );
    const adapter = new CreatomateVideoRenderAdapter('secret', request);
    await expect(adapter.inspect({ externalJobId: 'render-123' })).rejects.toMatchObject({
      category: 'INVALID_RESPONSE',
    });
  });
});
