import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  InstagramDirectPublishingAdapter,
  InstagramPublishingError,
} from '../src/providers/instagram-direct-publishing';

const token = 'test-ig-access-token';
const igUserId = '17841400000000001';
const containerId = '17889400000000001';
const postId = '17988400000000001';

describe('Instagram official API publishing transport', () => {
  it('creates an image container on a fixed Meta host without a URL token', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ id: containerId }));
    const adapter = new InstagramDirectPublishingAdapter('v26.0', send);
    await expect(
      adapter.createImageContainer({
        igUserId,
        imageUrl: 'https://media.example.com/post.jpg?signature=short-lived',
        caption: '新商品のご案内',
        accessToken: token,
      }),
    ).resolves.toEqual({ containerId });

    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://graph.instagram.com/v26.0/${igUserId}/media`);
    expect(url).not.toContain(token);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${token}` });
    expect(typeof init.body).toBe('string');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('image_url')).toBe('https://media.example.com/post.jpg?signature=short-lived');
    expect(body.get('caption')).toBe('新商品のご案内');
    expect(body.has('access_token')).toBe(false);
  });

  it('requires a finished media container before publishing', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ status_code: 'IN_PROGRESS' }));
    const adapter = new InstagramDirectPublishingAdapter('v26.0', send);
    await expect(
      adapter.publishFinishedContainer({ igUserId, containerId, accessToken: token }),
    ).rejects.toMatchObject({ category: 'INVALID_INPUT' });
    expect(send).toHaveBeenCalledTimes(1);
    const [url] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('fields=status_code');
  });

  it('rechecks media readiness, then publishes once and returns the actual post id', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(Response.json({ id: postId }));
    const adapter = new InstagramDirectPublishingAdapter('v26.0', send);
    await expect(
      adapter.publishFinishedContainer({ igUserId, containerId, accessToken: token }),
    ).resolves.toEqual({ externalPostId: postId });
    expect(send).toHaveBeenCalledTimes(2);
    const [url, init] = send.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`https://graph.instagram.com/v26.0/${igUserId}/media_publish`);
    expect(new URLSearchParams(init.body as string).get('creation_id')).toBe(containerId);
  });

  it('treats uncertain publish outcomes as UNKNOWN_RESULT and never auto-retries', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status_code: 'FINISHED' }))
      .mockRejectedValueOnce(new Error('connection lost after write'));
    const adapter = new InstagramDirectPublishingAdapter('v26.0', send);
    await expect(
      adapter.publishFinishedContainer({ igUserId, containerId, accessToken: token }),
    ).rejects.toMatchObject({ category: 'UNKNOWN_RESULT' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('treats provider 5xx during final publishing as ambiguous, not a safely retryable failure', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'hidden' } }, { status: 502 }));
    await expect(
      new InstagramDirectPublishingAdapter('v26.0', send).publishFinishedContainer({
        igUserId,
        containerId,
        accessToken: token,
      }),
    ).rejects.toMatchObject({ category: 'UNKNOWN_RESULT' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    'http://example.com/post.jpg',
    'https://localhost/post.jpg',
    'https://127.0.0.1/post.jpg',
    'https://user:pass@example.com/post.jpg',
    'https://media.example.com/post.jpg#fragment',
  ])('rejects untrusted media URLs before sending: %s', async (imageUrl) => {
    const send = vi.fn();
    await expect(
      new InstagramDirectPublishingAdapter('v26.0', send).createImageContainer({
        igUserId,
        imageUrl,
        caption: 'test',
        accessToken: token,
      }),
    ).rejects.toBeInstanceOf(InstagramPublishingError);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects malformed versions, user ids and API responses without exposing credentials', async () => {
    expect(() => new InstagramDirectPublishingAdapter('https://evil.test/')).toThrow();
    const send = vi.fn().mockResolvedValue(Response.json({ id: 'not-a-meta-id', token }));
    const adapter = new InstagramDirectPublishingAdapter('v26.0', send);
    await expect(
      adapter.createImageContainer({
        igUserId,
        imageUrl: 'https://media.example.com/post.jpg',
        caption: 'hello',
        accessToken: token,
      }),
    ).rejects.toMatchObject({ category: 'INVALID_RESPONSE' });
    await expect(
      adapter.createImageContainer({
        igUserId: '123/../other',
        imageUrl: 'https://media.example.com/post.jpg',
        caption: 'hello',
        accessToken: token,
      }),
    ).rejects.toMatchObject({ category: 'INVALID_INPUT' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
