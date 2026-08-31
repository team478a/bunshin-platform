import { describe, expect, it, vi } from 'vitest';
import {
  GetVideoRenderOperations,
  RequestVideoRenderRetry,
  type VideoRenderOperationsRepository,
} from '../src/index';

const repository = (): VideoRenderOperationsRepository => ({
  getSnapshot: vi.fn(),
  requestRetry: vi.fn(),
});

describe('video render operations', () => {
  it('returns the current-environment snapshot', async () => {
    const snapshot = {
      counts: { QUEUED: 1 } as never,
      items: [],
      sceneCounts: { QUEUED: 2, FAILED: 1 } as never,
      sceneItems: [],
    };
    const getSnapshot = vi.fn(() => Promise.resolve(snapshot));
    const result = await new GetVideoRenderOperations({
      ...repository(),
      getSnapshot,
    }).execute({ actorUserId: 'admin', environment: 'PRODUCTION' });

    expect(result).toBe(snapshot);
    expect(result.sceneCounts).toMatchObject({ QUEUED: 2, FAILED: 1 });
    expect(getSnapshot).toHaveBeenCalledWith({
      actorUserId: 'admin',
      environment: 'PRODUCTION',
    });
  });

  it('requires an auditable retry reason', async () => {
    await expect(
      new RequestVideoRenderRetry(repository()).execute({
        requestId: '11111111-1111-4111-8111-111111111111',
        actorUserId: 'admin',
        environment: 'PRODUCTION',
        renderId: '22222222-2222-4222-8222-222222222222',
        reason: '  ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('trims the reason and delegates one retry request', async () => {
    const created = {
      id: '33333333-3333-4333-8333-333333333333',
      jobId: '44444444-4444-4444-8444-444444444444',
      createdAt: new Date(),
    };
    const requestRetry = vi.fn(() => Promise.resolve(created));
    const result = await new RequestVideoRenderRetry({
      ...repository(),
      requestRetry,
    }).execute({
      requestId: '11111111-1111-4111-8111-111111111111',
      actorUserId: 'admin',
      environment: 'PRODUCTION',
      renderId: '22222222-2222-4222-8222-222222222222',
      reason: '  通信障害の復旧後に再実行  ',
    });

    expect(result).toBe(created);
    expect(requestRetry).toHaveBeenCalledWith(
      expect.objectContaining({ reason: '通信障害の復旧後に再実行' }),
    );
  });
});
