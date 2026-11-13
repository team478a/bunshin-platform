import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readServiceCampaignOverview,
  readServiceManagementHomeRecords,
} from '../app/s/[serviceSlug]/manage/service-management-home-repository';

const mocks = vi.hoisted(() => {
  const names = [
    'productPack',
    'campaign',
    'externalTrackingLink',
    'aiProviderConfiguration',
    'dailyMission',
    'contentLinkUsage',
    'missionActivity',
    'postRecord',
    'missionFeedback',
    'campaignPostingApprovalRequest',
    'missionDecision',
    'missionTrendContext',
    'aiUsageEvent',
    'groupKnowledgeSource',
    'videoRender',
    'lineMessageDelivery',
    'lineChannelConfiguration',
    'groupLineConfigurationAudit',
  ] as const;
  const counters = Object.fromEntries(
    names.map((name) => [
      name,
      {
        count: vi.fn(() => Promise.resolve(0)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
    ]),
  ) as Record<
    (typeof names)[number],
    {
      count: ReturnType<typeof vi.fn<() => Promise<number>>>;
      findMany: ReturnType<typeof vi.fn<() => Promise<never[]>>>;
    }
  >;
  const group = {
    memberships: [],
    serviceLegalDocuments: [],
    featurePolicies: [],
    knowledgeSources: [],
    lineChannelConfigurations: [],
    lineRoutingPolicies: [],
    fortuneServiceSetting: null,
  };
  return {
    counters,
    group: vi.fn<() => Promise<typeof group | null>>(() => Promise.resolve(group)),
    social: vi.fn(() => Promise.resolve(false)),
    training: vi.fn(() => Promise.resolve(true)),
    history: vi.fn<() => Promise<{ id: string } | null>>(() => Promise.resolve(null)),
    log: vi.fn(),
  };
});
vi.mock('@bunshin/database', () => ({
  prisma: {
    ...mocks.counters,
    group: { findFirst: mocks.group },
    bunshin: { findFirst: mocks.history },
  },
}));
vi.mock('@bunshin/observability', () => ({ createLogger: () => ({ error: mocks.log }) }));
vi.mock('../src/ai/secure-provider-configuration', () => ({
  currentAiProviderEnvironment: () => 'DEVELOPMENT',
}));
vi.mock('../src/line/secure-configuration', () => ({
  currentLineEnvironment: () => 'DEVELOPMENT',
}));
vi.mock('../src/services/improvement-feedback-admin-data', () => ({
  hasServiceSocialFeedbackSurface: mocks.social,
}));
vi.mock('../src/services/service-improvement-admin-data', () => ({
  hasTrainingOverviewSurface: mocks.training,
}));

const scope = { workspaceId: 'workspace-a', serviceId: 'service-a' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.social.mockResolvedValue(false);
});

describe('service management home scoped summaries', () => {
  it('does not query SNS or global posting provider readiness for a training-only service', async () => {
    const result = await readServiceManagementHomeRecords({
      ...scope,
      aiTraining: true,
      commercialContent: true,
      trendResearch: true,
    });
    expect(result?.summary).not.toBeNull();
    expect(result?.socialOperations).toBe(false);
    for (const name of [
      'dailyMission',
      'campaign',
      'productPack',
      'aiProviderConfiguration',
      'videoRender',
      'postRecord',
    ] as const)
      expect(mocks.counters[name].count).not.toHaveBeenCalled();
    expect(mocks.counters.missionFeedback.findMany).not.toHaveBeenCalled();
    expect(mocks.counters.missionActivity.findMany).not.toHaveBeenCalled();
    expect(mocks.counters.lineMessageDelivery.count).toHaveBeenCalled();
    expect(mocks.group).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: scope.workspaceId, id: scope.serviceId, status: 'ACTIVE' },
      }),
    );
  });

  it('retains posting queries for explicit mixed SOCIAL and training, within service scope', async () => {
    mocks.social.mockResolvedValue(true);
    const result = await readServiceManagementHomeRecords({
      ...scope,
      aiTraining: true,
      commercialContent: true,
      trendResearch: true,
    });
    expect(result?.socialOperations).toBe(true);
    expect(mocks.counters.dailyMission.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: scope.workspaceId,
          bunshin: { is: { groupId: scope.serviceId } },
        }),
      }),
    );
    expect(mocks.counters.productPack.count).toHaveBeenCalled();
  });

  it('retains SNS history and pending approvals after a SOCIAL assignment has been removed', async () => {
    mocks.history.mockResolvedValueOnce({ id: 'historical-bunshin' });
    const result = await readServiceManagementHomeRecords({ ...scope, aiTraining: true });
    expect(result?.socialOperations).toBe(true);
    expect(mocks.counters.postRecord.count).toHaveBeenCalled();
    expect(mocks.counters.campaignPostingApprovalRequest.count).toHaveBeenCalled();
    expect(mocks.history).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: scope.workspaceId,
          groupId: scope.serviceId,
        }),
      }),
    );
  });

  it('skips unused commercial readiness counts while retaining approval history when referrals are disabled', async () => {
    await readServiceManagementHomeRecords(scope);
    expect(mocks.counters.productPack.count).not.toHaveBeenCalled();
    expect(mocks.counters.campaignPostingApprovalRequest.count).toHaveBeenCalled();
    expect(mocks.counters.dailyMission.count).toHaveBeenCalledTimes(2);
  });

  it('marks aggregate failure unavailable without losing authorized core data or logging raw errors', async () => {
    mocks.counters.lineMessageDelivery.count.mockRejectedValueOnce(
      new Error('sensitive connection details'),
    );
    const result = await readServiceManagementHomeRecords(scope);
    expect(result?.group).toBeTruthy();
    expect(result?.summary).toBeNull();
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('sensitive connection details');
    expect(mocks.log).toHaveBeenCalled();
  });

  it('does not turn core state or capability failures into an empty dashboard', async () => {
    mocks.group.mockRejectedValueOnce(new Error('core unavailable'));
    await expect(readServiceManagementHomeRecords(scope)).rejects.toThrow('core unavailable');
    mocks.social.mockRejectedValueOnce(new Error('capability unavailable'));
    await expect(readServiceManagementHomeRecords(scope)).rejects.toThrow('capability unavailable');
  });

  it('returns not-found only when the core group is actually absent', async () => {
    mocks.group.mockResolvedValueOnce(null);
    expect(await readServiceManagementHomeRecords(scope)).toBeNull();
    expect(mocks.counters.dailyMission.count).not.toHaveBeenCalled();
  });
});

describe('service campaign overview', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  it('does not read activity when the Service has no product information or campaigns', async () => {
    await expect(readServiceCampaignOverview({ ...scope, now })).resolves.toMatchObject({
      inUse: false,
    });
    expect(mocks.counters.productPack.count).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-a', groupId: 'service-a' },
    });
    expect(mocks.counters.dailyMission.count).not.toHaveBeenCalled();
  });

  it('counts only this Service and separates self-reported posts', async () => {
    mocks.counters.productPack.count.mockResolvedValueOnce(1);
    mocks.counters.campaign.count.mockResolvedValueOnce(1);
    await expect(readServiceCampaignOverview({ ...scope, now })).resolves.toMatchObject({
      inUse: true,
    });
    const missionScope = expect.objectContaining({
      workspaceId: 'workspace-a',
      bunshin: { is: { groupId: 'service-a' } },
      campaign: { is: { workspaceId: 'workspace-a', groupId: 'service-a' } },
    });
    expect(mocks.counters.dailyMission.count).toHaveBeenCalledWith({ where: missionScope });
    expect(mocks.counters.postRecord.count).toHaveBeenCalledWith({
      where: { source: 'MANUAL', dailyMission: { is: missionScope } },
    });
    expect(mocks.counters.campaignPostingApprovalRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        status: 'PENDING',
      }),
    });
  });
});
