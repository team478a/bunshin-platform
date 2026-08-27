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
  it('maps an approved standard plan to a vertical RenderScript without personal metadata', () => {
    const script = buildCreatomateRenderScript(project());
    expect(script).toMatchObject({ output_format: 'mp4', width: 1080, height: 1920, duration: 30 });
    expect(script.elements).toHaveLength(10);
    expect(JSON.stringify(script)).not.toContain('ownerUserId');
    expect(JSON.stringify(script)).not.toContain('説明1');
  });

  it('rejects AI video scenes from the standard renderer', () => {
    const value = project();
    value.standardComposition = false;
    value.aiVideoSceneCount = 1;
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
      adapter.submit({ renderId: '30000000-0000-4000-8000-000000000001', project: project() }),
    ).resolves.toEqual({ externalJobId: 'render-123' });
    const init = request.mock.calls[0]?.[1] as RequestInit;
    expect(typeof init.body).toBe('string');
    const serialized = typeof init.body === 'string' ? init.body : '';
    const body = JSON.parse(serialized) as Record<string, unknown>;
    expect(body.metadata).toBe('30000000-0000-4000-8000-000000000001');
    expect(serialized).not.toContain('10000000-0000-4000-8000-000000000005');
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
