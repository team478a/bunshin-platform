import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoRenderCompletionContext } from '@bunshin/application';
import sharp from 'sharp';
const fake = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  send: vi.fn(),
  sign: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  prisma: { videoRender: { findFirst: fake.findFirst, updateMany: fake.updateMany } },
}));
vi.mock('../src/line/messaging-provider', () => ({
  LineMessagingApiAdapter: class {
    pushVideoCompletion = fake.send;
    getQuota = vi.fn();
  },
}));
vi.mock('../src/video/video-render-output-storage', () => ({
  SupabaseVideoRenderOutputStorage: class {
    createLineDeliveryUrl = fake.sign;
  },
}));
import { videoCompletionMessaging } from '../src/line/video-completion-messaging';
import { GET } from '../app/api/media/video-cover/route';

const createMessaging = (context: VideoRenderCompletionContext) =>
  videoCompletionMessaging(
    context,
    async () =>
      ({
        prisma: { videoRender: { findFirst: fake.findFirst, updateMany: fake.updateMany } },
      }) as never,
  );

const id = '11111111-1111-4111-8111-111111111111';
const context: VideoRenderCompletionContext = {
  renderId: id,
  workspaceId: 'workspace',
  groupId: 'group',
  bunshinId: 'bunshin',
  ownerUserId: 'owner',
  videoProjectId: 'project',
  projectTitle: 'Title',
  completedAt: new Date(),
  notificationStatus: 'PENDING',
  notificationAttemptCount: 0,
};
const input = {
  accessToken: 'test-token',
  recipientId: 'recipient',
  projectTitle: 'Title',
  reviewUrl: 'https://example.com/review',
  retryKey: id,
};

beforeEach(() => {
  vi.clearAllMocks();
  const row = {
    outputStorageKey: `workspace/owner/${id}.mp4`,
    expiresAt: null,
    notificationSnapshot: null as string | null,
  };
  fake.findFirst.mockImplementation(() => Promise.resolve({ ...row }));
  fake.updateMany.mockImplementation((value: { data: { notificationSnapshot: string } }) => {
    if (!row.notificationSnapshot) row.notificationSnapshot = value.data.notificationSnapshot;
    return Promise.resolve({ count: 1 });
  });
  fake.sign.mockResolvedValue('https://storage.example/video.mp4?token=signed');
  fake.send.mockResolvedValue({ ok: true });
});

describe('completed video attachments', () => {
  it('freezes attachment, title and review URL for retries before external delivery', async () => {
    const messaging = createMessaging(context);
    await messaging.pushVideoCompletion(input);
    await messaging.pushVideoCompletion({
      ...input,
      projectTitle: 'changed',
      reviewUrl: 'https://example.com/changed',
    });
    expect(fake.send.mock.calls[1]).toEqual(fake.send.mock.calls[0]);
    expect(fake.send).toHaveBeenCalledWith(
      expect.objectContaining({
        video: {
          originalContentUrl: 'https://storage.example/video.mp4?token=signed',
          previewImageUrl: 'https://example.com/api/media/video-cover',
        },
      }),
    );
    expect(fake.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      fake.send.mock.invocationCallOrder[0]!,
    );
    expect(fake.sign).toHaveBeenCalledOnce();
    expect(fake.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: 'workspace',
        groupId: 'group',
        ownerUserId: 'owner',
        project: expect.objectContaining({
          bunshinId: 'bunshin',
          ownerUserId: 'owner',
          status: { not: 'CANCELLED' },
        }),
      }),
    });
  });
  it('uses the persisted winner when simultaneous attempts prepare different signed URLs', async () => {
    fake.sign
      .mockResolvedValueOnce('https://storage.example/one')
      .mockResolvedValueOnce('https://storage.example/two');
    await Promise.all([
      createMessaging(context).pushVideoCompletion(input),
      createMessaging(context).pushVideoCompletion(input),
    ]);
    expect(fake.send.mock.calls[0]).toEqual(fake.send.mock.calls[1]);
  });
  it.each([{ recipientId: 'different' }, { accessToken: 'rotated' }])(
    'refuses to change destination or credentials after preparation',
    async (change) => {
      const messaging = createMessaging(context);
      await messaging.pushVideoCompletion(input);
      await expect(messaging.pushVideoCompletion({ ...input, ...change })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(fake.send).toHaveBeenCalledOnce();
    },
  );
  it('does not attach videos to legacy notification retries', async () => {
    await createMessaging({ ...context, notificationAttemptCount: 1 }).pushVideoCompletion(input);
    expect(fake.sign).not.toHaveBeenCalled();
    expect(fake.send.mock.calls[0]![0]).not.toHaveProperty('video');
  });
  it('refuses inaccessible or expired renders', async () => {
    fake.findFirst.mockResolvedValue(null);
    await expect(createMessaging(context).pushVideoCompletion(input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    fake.findFirst.mockResolvedValue({ outputStorageKey: 'wrong-owner', expiresAt: new Date(0) });
    await expect(createMessaging(context).pushVideoCompletion(input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(fake.send).not.toHaveBeenCalled();
  });
  it('serves a small 9:16 PNG cover without private content', async () => {
    const response = await GET();
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(bytes.length).toBeLessThan(1_000_000);
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 540, height: 960, format: 'png' });
  });
});
