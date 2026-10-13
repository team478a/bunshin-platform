import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  findConnection: vi.fn(),
  updateConnection: vi.fn(),
  readiness: vi.fn(),
  read: vi.fn(),
  currentAssignment: vi.fn(),
  render: vi.fn(),
  activate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupLineConnection: {
      findFirst: f.findConnection,
      updateMany: f.updateConnection,
    },
  },
  PrismaPersonalLearningPilotRepository: class {
    readiness = f.readiness;
    read = f.read;
    currentAssignment = f.currentAssignment;
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
  activatePersonalLearningGroupRichMenu: f.activate,
}));
import {
  activatePersonalLearningLineMenu,
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
  personalLearningRichMenuLinkedAt: null as Date | null,
  personalLearningRichMenuContentHash: null as string | null,
  configuration: { encryptedAccessToken: 'encrypted-test-token' },
};

describe('personal learning LINE menu service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.findConnection.mockResolvedValue({ ...connection });
    f.updateConnection.mockResolvedValue({ count: 1 });
    f.readiness.mockResolvedValue({ profileReady: true, approvalReady: true });
    f.read.mockResolvedValue({
      plans: [{ isCurrent: true, goalActive: true, plan: { planId: 'plan-1', revision: 2 } }],
    });
    f.currentAssignment.mockResolvedValue({ display: { title: '今回の実践' } });
    f.render.mockResolvedValue(Buffer.from([1, 2, 3]));
    f.activate.mockImplementation(async (input: { onCreated?: (id: string) => Promise<void> }) => {
      await input.onCreated?.('richmenu-1');
      return { lineRichMenuId: 'richmenu-1' };
    });
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

  it('stores the created menu before linking and reuses the existing ID', async () => {
    await expect(
      activatePersonalLearningLineMenu({ actor, serviceSlug: 'manaberu-style' }),
    ).resolves.toEqual({ linked: true });
    expect(f.activate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerUserId: 'U-learner',
        existingLineRichMenuId: null,
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
          providerUserId: 'U-learner',
        }),
        data: { personalLearningRichMenuId: 'richmenu-1' },
      }),
    );
    expect(f.updateConnection).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          personalLearningRichMenuLinkedAt: expect.any(Date),
          personalLearningRichMenuContentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
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
    expect(f.activate).not.toHaveBeenCalled();
    expect(f.updateConnection).not.toHaveBeenCalled();
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
    expect(f.activate).not.toHaveBeenCalled();
  });
});
