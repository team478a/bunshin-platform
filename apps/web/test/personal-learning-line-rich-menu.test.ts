import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  findConnection: vi.fn(),
  findEnrollment: vi.fn(),
  readPractice: vi.fn(),
  updateConnection: vi.fn(),
  readiness: vi.fn(),
  read: vi.fn(),
  currentAssignment: vi.fn(),
  render: vi.fn(),
  createMenu: vi.fn(),
  uploadImage: vi.fn(),
  linkMenu: vi.fn(),
  deleteMenu: vi.fn(),
  logError: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupLineConnection: {
      findFirst: f.findConnection,
      updateMany: f.updateConnection,
    },
    programEnrollment: { findFirst: f.findEnrollment },
  },
  PrismaPersonalLearningPilotRepository: class {
    readiness = f.readiness;
    read = f.read;
    currentAssignment = f.currentAssignment;
  },
  PrismaPersonalLearningPracticeRepository: class {
    readPractice = f.readPractice;
  },
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://app.example.com' }),
}));
vi.mock('../src/line/secure-configuration', () => ({
  currentLineEnvironment: () => 'STAGING',
  AesGcmLineSecretCrypto: class {
    decrypt = () => 'safe-test-token';
  },
}));
vi.mock('../src/line/default-rich-menu', () => ({
  renderPersonalLearningLineRichMenu: f.render,
}));
vi.mock('../src/line/group-rich-menu-provider', () => ({
  createPersonalLearningGroupRichMenu: f.createMenu,
  uploadPersonalLearningGroupRichMenuImage: f.uploadImage,
  linkGroupRichMenuToUser: f.linkMenu,
  deleteGroupRichMenu: f.deleteMenu,
}));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ child: () => ({ error: f.logError }) }),
}));
import {
  activatePersonalLearningLineMenu,
  dynamicPersonalLearningPracticeTitle,
  personalLearningLineMenuStatus,
} from '../src/services/personal-learning-line-rich-menu';

const actor = {
  actorUserId: '00000000-0000-4000-8000-000000000005',
  scope: {
    workspaceId: '00000000-0000-4000-8000-000000000001',
    groupId: '00000000-0000-4000-8000-000000000002',
    programEnrollmentId: '00000000-0000-4000-8000-000000000003',
    groupMembershipId: '00000000-0000-4000-8000-000000000004',
    userId: '00000000-0000-4000-8000-000000000005',
  },
};
const connection = {
  id: '00000000-0000-4000-8000-000000000006',
  configurationId: '00000000-0000-4000-8000-000000000007',
  providerUserId: 'U-learner',
  personalLearningRichMenuId: null as string | null,
  personalLearningRichMenuPendingId: null as string | null,
  personalLearningRichMenuLinkedAt: null as Date | null,
  personalLearningRichMenuContentHash: null as string | null,
  configuration: { encryptedAccessToken: 'encrypted-test-token' },
};

describe('personal learning LINE menu service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.findConnection.mockResolvedValue({ ...connection });
    f.findEnrollment.mockResolvedValue({
      serviceProgram: {
        settings: { personalLearningPilot: { learningMode: 'FIXED_DEFINITIONS_V1' } },
      },
    });
    f.updateConnection.mockResolvedValue({ count: 1 });
    f.readiness.mockResolvedValue({ profileReady: true, approvalReady: true });
    f.read.mockResolvedValue({
      plans: [{ isCurrent: true, goalActive: true, plan: { planId: 'plan-1', revision: 2 } }],
    });
    f.currentAssignment.mockResolvedValue({ display: { title: '今回の実践' } });
    f.render.mockResolvedValue(Buffer.from([1, 2, 3]));
    f.createMenu.mockResolvedValue('richmenu-1');
    f.uploadImage.mockResolvedValue(undefined);
    f.linkMenu.mockResolvedValue(undefined);
    f.deleteMenu.mockResolvedValue(undefined);
  });

  it('requires active, followed, service-scoped dedicated LINE and reports status only', async () => {
    f.findConnection.mockResolvedValue({
      personalLearningRichMenuLinkedAt: new Date(),
      personalLearningRichMenuContentHash: 'different-hash',
    });
    await expect(personalLearningLineMenuStatus(actor, '今回の実践')).resolves.toMatchObject({
      available: true,
      linked: true,
      needsRefresh: true,
    });
    const where = f.findConnection.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({
      workspaceId: actor.scope.workspaceId,
      groupId: actor.scope.groupId,
      groupMembershipId: actor.scope.groupMembershipId,
      userId: actor.actorUserId,
      friendshipStatus: 'FOLLOWING',
      configuration: {
        environment: 'STAGING',
        status: 'ACTIVE',
        globallyPaused: false,
      },
    });
  });

  it('stores a pending menu before upload, links it, then commits the new menu ID', async () => {
    await expect(
      activatePersonalLearningLineMenu({ actor, serviceSlug: 'manaberu-style' }),
    ).resolves.toEqual({ linked: true });
    expect(f.createMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: actor.scope.groupId,
        enrollmentId: actor.scope.programEnrollmentId,
        appUrl: 'https://app.example.com',
      }),
    );
    expect(f.updateConnection).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
          groupMembershipId: actor.scope.groupMembershipId,
          userId: actor.actorUserId,
          personalLearningRichMenuPendingId: null,
        }),
        data: { personalLearningRichMenuPendingId: 'richmenu-1' },
      }),
    );
    expect(f.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ lineRichMenuId: 'richmenu-1' }),
    );
    expect(f.linkMenu).toHaveBeenCalledWith(
      expect.objectContaining({ providerUserId: 'U-learner', lineRichMenuId: 'richmenu-1' }),
    );
    expect(f.updateConnection).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ personalLearningRichMenuPendingId: 'richmenu-1' }),
        data: expect.objectContaining({
          personalLearningRichMenuId: 'richmenu-1',
          personalLearningRichMenuPendingId: null,
          personalLearningRichMenuLinkedAt: expect.any(Date),
          personalLearningRichMenuContentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it('uses the dynamic current practice title instead of fixed pilot assignments', async () => {
    f.findEnrollment.mockResolvedValue({
      serviceProgram: {
        settings: {
          personalLearningPilot: {
            enabled: true,
            enrollmentIds: [actor.scope.programEnrollmentId],
            learningMode: 'DYNAMIC_V1',
            learningFeatures: {
              conversation: false,
              multiTopic: false,
              lineLearning: true,
              extendedScope: false,
            },
          },
        },
      },
    });
    f.readPractice.mockResolvedValue({
      allowed: true,
      current: { candidate: { proposal: { outcome: '自分の作業に合う練習' } } },
    });

    const dynamicActor = {
      ...actor,
      programSettings: {
        personalLearningPilot: {
          enabled: true,
          enrollmentIds: [actor.scope.programEnrollmentId],
          learningMode: 'DYNAMIC_V1',
          learningFeatures: {
            conversation: false,
            multiTopic: false,
            lineLearning: true,
            extendedScope: false,
          },
        },
      },
    };
    await expect(dynamicPersonalLearningPracticeTitle(dynamicActor)).resolves.toBe(
      '自分の作業に合う練習',
    );
    await expect(
      activatePersonalLearningLineMenu({ actor: dynamicActor, serviceSlug: 'manaberu-style' }),
    ).resolves.toEqual({ linked: true });
    expect(f.render).toHaveBeenCalledWith('自分の作業に合う練習');
    expect(f.readiness).not.toHaveBeenCalled();
    expect(f.currentAssignment).not.toHaveBeenCalled();
  });

  it('does not call LINE again when the same menu content is already active', async () => {
    const digest = await import('node:crypto');
    f.findConnection.mockResolvedValue({
      ...connection,
      personalLearningRichMenuId: 'richmenu-1',
      personalLearningRichMenuLinkedAt: new Date(),
      personalLearningRichMenuContentHash: digest
        .createHash('sha256')
        .update('今回の実践', 'utf8')
        .digest('hex'),
    });
    await expect(
      activatePersonalLearningLineMenu({ actor, serviceSlug: 'manaberu-style' }),
    ).resolves.toEqual({ linked: true });
    expect(f.createMenu).not.toHaveBeenCalled();
    expect(f.uploadImage).not.toHaveBeenCalled();
    expect(f.linkMenu).not.toHaveBeenCalled();
    expect(f.updateConnection).not.toHaveBeenCalled();
  });

  it('cleans an earlier pending menu before creating a replacement', async () => {
    f.findConnection.mockResolvedValueOnce({
      ...connection,
      personalLearningRichMenuPendingId: 'richmenu-pending',
    });
    await expect(
      activatePersonalLearningLineMenu({ actor, serviceSlug: 'manaberu-style' }),
    ).resolves.toEqual({ linked: true });
    expect(f.deleteMenu).toHaveBeenCalledWith(
      expect.objectContaining({ lineRichMenuId: 'richmenu-pending' }),
    );
    expect(f.updateConnection).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ personalLearningRichMenuPendingId: 'richmenu-pending' }),
        data: { personalLearningRichMenuPendingId: null },
      }),
    );
    expect(f.updateConnection).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { personalLearningRichMenuPendingId: 'richmenu-1' } }),
    );
  });

  it('retains the new ID for retry when upload or user linking fails', async () => {
    f.linkMenu.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(
      activatePersonalLearningLineMenu({ actor, serviceSlug: 'manaberu-style' }),
    ).rejects.toThrow('provider unavailable');
    expect(f.updateConnection).toHaveBeenCalledTimes(1);
    expect(f.updateConnection.mock.calls[0]?.[0]).toMatchObject({
      data: { personalLearningRichMenuPendingId: 'richmenu-1' },
    });
    expect(f.updateConnection.mock.calls[0]?.[0]).not.toMatchObject({
      data: expect.objectContaining({ personalLearningRichMenuId: 'richmenu-1' }),
    });
  });

  it('keeps the successful replacement when deletion of the old menu fails and logs the cleanup', async () => {
    f.findConnection.mockResolvedValueOnce({
      ...connection,
      personalLearningRichMenuId: 'richmenu-old',
      personalLearningRichMenuLinkedAt: new Date('2026-10-01T00:00:00Z'),
      personalLearningRichMenuContentHash: 'old-hash',
    });
    f.deleteMenu.mockRejectedValueOnce(new Error('delete failed'));
    await expect(
      activatePersonalLearningLineMenu({ actor, serviceSlug: 'manaberu-style' }),
    ).resolves.toEqual({ linked: true });
    expect(f.logError).toHaveBeenCalledWith(
      'previous personal LINE menu cleanup failed',
      expect.objectContaining({ lineRichMenuId: 'richmenu-old', error: 'delete failed' }),
    );
    expect(f.updateConnection).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ personalLearningRichMenuId: 'richmenu-1' }),
      }),
    );
  });

  it('keeps an ID in Pending when the active-connection compare-and-set loses a race', async () => {
    f.updateConnection.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await expect(
      activatePersonalLearningLineMenu({ actor, serviceSlug: 'manaberu-style' }),
    ).rejects.toThrow('Manaberu LINE connection changed');
    expect(f.updateConnection).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ personalLearningRichMenuPendingId: null }),
        data: { personalLearningRichMenuPendingId: 'richmenu-1' },
      }),
    );
    expect(f.uploadImage).not.toHaveBeenCalled();
    expect(f.linkMenu).not.toHaveBeenCalled();
  });

  it('fails closed without a followed connection or a confirmed current assignment', async () => {
    f.findConnection.mockResolvedValueOnce(null);
    await expect(
      activatePersonalLearningLineMenu({ actor, serviceSlug: 'manaberu-style' }),
    ).rejects.toThrow('active Manaberu LINE connection required');
    f.findConnection.mockResolvedValueOnce({ ...connection });
    f.currentAssignment.mockResolvedValueOnce(null);
    await expect(
      activatePersonalLearningLineMenu({ actor, serviceSlug: 'manaberu-style' }),
    ).rejects.toThrow('current practice is required');
    expect(f.createMenu).not.toHaveBeenCalled();
  });
});
