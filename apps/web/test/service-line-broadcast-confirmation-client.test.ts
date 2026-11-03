import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  broadcastCommand,
  parseBroadcastDraft,
  previewBroadcast,
  submitBroadcast,
} from '../app/s/[serviceSlug]/manage/line/broadcast-confirmation-client';
const draft = {
  title: '案内',
  message: '本文',
  reason: '参加者への案内',
  segment: { industryIds: [], purposes: [] },
};
afterEach(() => vi.unstubAllGlobals());
describe('frozen broadcast command', () => {
  it('does not confirm against an older preview server that cannot deduplicate reservations', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { eligibleRecipientCount: 2, capped: false } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await previewBroadcast('social-a', draft)).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/services/social-a/line-broadcasts/preview');
  });
  it('does not infer invalid inputs and keeps private scope out of the request contract', () => {
    expect(parseBroadcastDraft({ ...draft, message: '  ' })).toBeNull();
    expect(parseBroadcastDraft({ ...draft, workspaceId: 'forged' })).toBeNull();
    expect(parseBroadcastDraft({ ...draft, scheduledAt: '2030-01-01T10:30' })).toBeNull();
    const c = broadcastCommand(draft, 2);
    expect(c.confirmed).toBe('SERVICE_LINE_BROADCAST_SCHEDULE_V1');
    expect(c).not.toHaveProperty('workspaceId');
    expect(c).not.toHaveProperty('scheduledAt');
  });
  it('replays exactly the same request after a lost response without generating another ID', async () => {
    const c = broadcastCommand(draft, 2);
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            broadcastId: c.operationId,
            requested: 2,
            scheduledAt: '2026-11-03T00:00:00.000Z',
            status: 'COMPLETED',
            replayed: true,
          },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    expect((await submitBroadcast('social-a', c)).kind).toBe('UNKNOWN');
    expect(await submitBroadcast('social-a', c)).toMatchObject({
      kind: 'RECEIVED',
      receipt: { status: 'COMPLETED', replayed: true },
    });
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
  });
  it('mismatched receipts and server failures remain uncertain; explicit rejection requires review', async () => {
    const c = broadcastCommand({ ...draft, scheduledAt: '2030-01-01T00:00:00.000Z' }, 2);
    const valid = {
      broadcastId: c.operationId,
      requested: 2,
      scheduledAt: c.scheduledAt,
      status: 'SCHEDULED',
      replayed: false,
    };
    for (const data of [
      { ...valid, broadcastId: crypto.randomUUID() },
      { ...valid, requested: 3 },
      { ...valid, scheduledAt: '2031-01-01T00:00:00.000Z' },
      {},
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data })));
      expect((await submitBroadcast('social-a', c)).kind).toBe('UNKNOWN');
    }
    for (const status of [429, 500, 503]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
      expect((await submitBroadcast('social-a', c)).kind).toBe('UNKNOWN');
    }
    for (const status of [400, 401, 403, 409]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
      expect((await submitBroadcast('social-a', c)).kind).toBe('REJECTED');
    }
  });
});
