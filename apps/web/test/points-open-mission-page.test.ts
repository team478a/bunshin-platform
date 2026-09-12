import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  resolveService: vi.fn(),
  pilot: vi.fn(),
  findMission: vi.fn(),
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
vi.mock('../src/services/public-service', () => ({
  resolvePublicServiceContext: mocks.resolveService,
}));
vi.mock('../src/navigation/route-not-found', () => ({ isRouteNotFound: () => false }));
vi.mock('@bunshin/capability-social', () => ({
  RecordMissionActivity: class {
    execute = mocks.record;
  },
}));
vi.mock('@bunshin/database', () => ({
  getActiveRewardsPilotAccess: mocks.pilot,
  PrismaDailyMissionRepository: class {},
  PrismaBunshinCapabilityAssignmentRepository: class {},
  PrismaMissionEngagementRepository: class {},
  prisma: { dailyMission: { findFirst: mocks.findMission } },
}));

import OpenMissionForPointsPage from '../app/(app)/points/open-mission/page';

describe('points latest mission opener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ userId: 'user-a' });
    mocks.resolveService.mockResolvedValue({
      workspaceId: 'workspace-a',
      serviceId: 'group-a',
      configuration: { slug: 'my-service' },
    });
    mocks.pilot.mockResolvedValue({ groupId: 'group-a' });
    mocks.findMission.mockResolvedValue({ id: 'mission-a', bunshinId: 'bunshin-a' });
    mocks.record.mockResolvedValue({ id: 'activity-a' });
  });

  it('records the latest mission view before opening the service page', async () => {
    await expect(
      OpenMissionForPointsPage({ searchParams: Promise.resolve({ serviceSlug: 'my-service' }) }),
    ).rejects.toThrow('REDIRECT:/s/my-service/bunshins/bunshin-a#today-post');

    expect(mocks.findMission).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'workspace-a' }),
        orderBy: [{ missionDate: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        actorUserId: 'user-a',
        dailyMissionId: 'mission-a',
        type: 'VIEWED',
      }),
    );
  });

  it('does not record activity outside an active rewards pilot', async () => {
    mocks.pilot.mockResolvedValue(null);

    await expect(
      OpenMissionForPointsPage({ searchParams: Promise.resolve({ serviceSlug: 'my-service' }) }),
    ).rejects.toThrow('REDIRECT:/points?serviceSlug=my-service');
    expect(mocks.findMission).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('still opens the owned mission when activity recording is unavailable', async () => {
    mocks.record.mockRejectedValue(new ApplicationError('FORBIDDEN', 'assignment unavailable'));

    await expect(
      OpenMissionForPointsPage({ searchParams: Promise.resolve({ serviceSlug: 'my-service' }) }),
    ).rejects.toThrow('REDIRECT:/s/my-service/bunshins/bunshin-a#today-post');
  });
});
