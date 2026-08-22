import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Application from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  consume: vi.fn(),
  record: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.currentUser }),
}));
vi.mock('@bunshin/application', async (original) => {
  const actual = await original<typeof Application>();
  return {
    ...actual,
    ConsumeMissionDeepLinkState: class {
      execute = mocks.consume;
    },
  };
});
vi.mock('@bunshin/capability-social', () => ({
  RecordMissionActivity: class {
    execute = mocks.record;
  },
}));
vi.mock('@bunshin/database', () => ({
  PrismaMissionDeepLinkStateRepository: class {},
  PrismaDailyMissionRepository: class {},
  PrismaBunshinCapabilityAssignmentRepository: class {},
  PrismaMissionEngagementRepository: class {},
}));
vi.mock('../src/line/mission-deep-link-signer', () => ({ HkdfMissionDeepLinkSigner: class {} }));
vi.mock('../src/line/secure-configuration', () => ({ currentLineEnvironment: () => 'PRODUCTION' }));

import TodayPage from '../app/today/page';

describe('Mission Deep Link landing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a verified session before consuming state', async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(TodayPage({ searchParams: Promise.resolve({ state: 'opaque' }) })).rejects.toThrow(
      'REDIRECT:/login',
    );
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('records VIEWED and redirects only to the verified Bunshin path without the token', async () => {
    mocks.currentUser.mockResolvedValue({ userId: 'user-a' });
    mocks.consume.mockResolvedValue({
      id: 'state-a',
      workspaceId: 'workspace-a',
      bunshinId: 'bunshin-a',
      dailyMissionId: 'mission-a',
    });
    mocks.record.mockResolvedValue({ id: 'activity-a' });
    await expect(
      TodayPage({ searchParams: Promise.resolve({ state: 'secret-token' }) }),
    ).rejects.toThrow('REDIRECT:/bunshins/bunshin-a#daily-mission');
    expect(mocks.consume).toHaveBeenCalledWith({
      token: 'secret-token',
      environment: 'PRODUCTION',
      actorUserId: 'user-a',
    });
    expect(mocks.record).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      actorUserId: 'user-a',
      bunshinId: 'bunshin-a',
      dailyMissionId: 'mission-a',
      type: 'VIEWED',
      idempotencyKey: 'line-deep-link:state-a',
      metadata: null,
    });
    expect(mocks.redirect).not.toHaveBeenCalledWith(expect.stringContaining('secret-token'));
  });

  it('rejects missing or oversized state before database access', async () => {
    mocks.currentUser.mockResolvedValue({ userId: 'user-a' });
    await expect(TodayPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NOT_FOUND');
    await expect(
      TodayPage({ searchParams: Promise.resolve({ state: 'x'.repeat(2049) }) }),
    ).rejects.toThrow('NOT_FOUND');
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('uses the same not-found boundary for expired, reused or cross-scope state', async () => {
    mocks.currentUser.mockResolvedValue({ userId: 'user-b' });
    mocks.consume.mockRejectedValue(new ApplicationError('FORBIDDEN', 'state is not usable'));
    await expect(TodayPage({ searchParams: Promise.resolve({ state: 'opaque' }) })).rejects.toThrow(
      'NOT_FOUND',
    );
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
