import { beforeEach, describe, expect, it, vi } from 'vitest';
import FortuneWeeklyLineEntry from '../app/s/[serviceSlug]/today/from-line/page';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  preference: vi.fn(),
  createMany: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('../src/fortune/page-context', () => ({ resolveFortunePage: mocks.resolve }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    serviceNotificationPreference: { findFirst: mocks.preference },
    serviceMembershipEvent: { createMany: mocks.createMany },
  },
}));

const open = () =>
  FortuneWeeklyLineEntry({ params: Promise.resolve({ serviceSlug: 'test-fortune' }) });

describe('weekly LINE Fortune entry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolve.mockResolvedValue({
      actor: { userId: 'member' },
      service: { workspaceId: 'workspace', serviceId: 'service' },
      setting: { weeklyNotificationEnabled: true },
    });
  });

  it('records a deduplicated visit for the signed-in and opted-in participant', async () => {
    mocks.preference.mockResolvedValue({ groupMembershipId: 'membership' });
    await open();
    expect(mocks.resolve).toHaveBeenCalledWith('test-fortune', '/s/test-fortune/today/from-line');
    expect(mocks.preference).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'member',
          workspaceId: 'workspace',
          groupId: 'service',
          enabled: true,
          optedOutAt: null,
        }),
      }),
    );
    expect(mocks.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: expect.objectContaining({
        groupMembershipId: 'membership',
        eventType: 'FORTUNE_WEEKLY_LINE_RETURN',
        idempotencyKey: expect.stringMatching(/^fortune-line-return:membership:\d{4}-\d{2}-\d{2}$/),
      }),
    });
    expect(mocks.redirect).toHaveBeenCalledWith('/s/test-fortune/today');
  });

  it('opens today without recording a visit after notification withdrawal', async () => {
    mocks.preference.mockResolvedValue(null);
    await open();
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith('/s/test-fortune/today');
  });

  it('propagates the login or membership gate before inspecting notification preferences', async () => {
    mocks.resolve.mockRejectedValue(new Error('membership required'));
    await expect(open()).rejects.toThrow('membership required');
    expect(mocks.preference).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
