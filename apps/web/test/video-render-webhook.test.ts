import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { videoRenderWebhookResponse } from '../src/http/video-render-webhook';

const claims = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  renderId: '22222222-2222-4222-8222-222222222222',
};
const request = (body: object, state = 'signed') =>
  new Request(`https://app.example/api/video-renders/webhook?state=${state}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('video render webhook', () => {
  it('reconciles only after matching the signed internal id and persisted provider id', async () => {
    const reconcile = vi.fn().mockResolvedValue({ status: 'SUCCEEDED' });
    const response = await videoRenderWebhookResponse(
      request({ id: 'provider-1', metadata: claims.renderId, status: 'succeeded' }),
      () =>
        Promise.resolve({
          verifyState: () => claims,
          findRender: vi
            .fn()
            .mockResolvedValue({ status: 'RENDERING', externalJobId: 'provider-1' }),
          reconcile,
        }),
    );
    expect(response.status).toBe(204);
    expect(reconcile).toHaveBeenCalledWith(claims);
  });

  it('does not submit again when a callback arrives before submission is persisted', async () => {
    const reconcile = vi.fn();
    const response = await videoRenderWebhookResponse(
      request({ id: 'provider-1', metadata: claims.renderId, status: 'succeeded' }),
      () =>
        Promise.resolve({
          verifyState: () => claims,
          findRender: vi.fn().mockResolvedValue({ status: 'QUEUED', externalJobId: null }),
          reconcile,
        }),
    );
    expect(response.status).toBe(202);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('rejects mismatched metadata without disclosing the render', async () => {
    const response = await videoRenderWebhookResponse(
      request({
        id: 'provider-1',
        metadata: '33333333-3333-4333-8333-333333333333',
        status: 'failed',
      }),
      () =>
        Promise.resolve({
          verifyState: () => claims,
          findRender: vi.fn(),
          reconcile: vi.fn(),
        }),
    );
    expect(response.status).toBe(403);
  });
});
