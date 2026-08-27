import { describe, expect, it, vi } from 'vitest';
import {
  FinalizeVideoRenderCompletion,
  SendVideoCompletionNotification,
  type VideoRenderCompletionContext,
  type VideoRenderCompletionRepository,
} from '../src/index';

const context: VideoRenderCompletionContext = {
  renderId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  groupId: '33333333-3333-4333-8333-333333333333',
  bunshinId: '44444444-4444-4444-8444-444444444444',
  ownerUserId: '55555555-5555-4555-8555-555555555555',
  videoProjectId: '66666666-6666-4666-8666-666666666666',
  projectTitle: '紹介動画',
  notificationStatus: 'PENDING',
  notificationAttemptCount: 0,
};

const repository = (overrides: Partial<VideoRenderCompletionRepository> = {}) => ({
  finalize: vi.fn(() => Promise.resolve(context)),
  recordNotification: vi.fn(() => Promise.resolve(true)),
  ...overrides,
});

describe('video render completion', () => {
  it('finalizes only a valid completed render scope', async () => {
    const finalize = vi.fn(() => Promise.resolve(context));
    const result = await new FinalizeVideoRenderCompletion(repository({ finalize })).execute({
      environment: 'PRODUCTION',
      workspaceId: context.workspaceId,
      renderId: context.renderId,
      localDate: '2026-08-27',
      completedAt: new Date('2026-08-27T10:00:00Z'),
    });
    expect(result).toBe(context);
    expect(finalize).toHaveBeenCalledOnce();
  });

  it('sends one completion message and records success', async () => {
    const recordNotification = vi.fn(() => Promise.resolve(true));
    const pushVideoCompletion = vi.fn(() => Promise.resolve({ ok: true as const }));
    const result = await new SendVideoCompletionNotification(
      repository({ recordNotification }),
      {
        getActive: vi.fn(() =>
          Promise.resolve({
            environment: 'PRODUCTION' as const,
            accessToken: 'token',
            globallyPaused: false,
            quotaWarningPercent: 80,
            quotaLowPriorityStop: 90,
          }),
        ),
      },
      { resolve: vi.fn(() => Promise.resolve('line-user')) },
      { isAllowed: vi.fn(() => Promise.resolve(true)) },
      {
        getQuota: vi.fn(() => Promise.resolve({ ok: true as const, limit: 100, consumption: 1 })),
        pushVideoCompletion,
      },
    ).execute({
      context,
      environment: 'PRODUCTION',
      reviewUrl: 'https://example.jp/groups/group/videos/project',
    });
    expect(result).toEqual({ sent: true, retryable: false, errorCode: null });
    expect(pushVideoCompletion).toHaveBeenCalledOnce();
    expect(recordNotification).toHaveBeenCalledWith(expect.objectContaining({ status: 'SENT' }));
  });

  it('does not send again after notification success', async () => {
    const pushVideoCompletion = vi.fn();
    const result = await new SendVideoCompletionNotification(
      repository(),
      { getActive: vi.fn() },
      { resolve: vi.fn() },
      { isAllowed: vi.fn() },
      { getQuota: vi.fn(), pushVideoCompletion },
    ).execute({
      context: { ...context, notificationStatus: 'SENT' },
      environment: 'PRODUCTION',
      reviewUrl: 'https://example.jp/groups/group/videos/project',
    });
    expect(result.sent).toBe(true);
    expect(pushVideoCompletion).not.toHaveBeenCalled();
  });
});
