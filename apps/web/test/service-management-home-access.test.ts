import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadServiceManagementHome,
  ServiceManagementAccessError,
} from '../app/s/[serviceSlug]/manage/service-management-home-data';
import { serviceHomeFixture } from './service-management-home-fixture';

const mocks = vi.hoisted(() => ({
  actor: vi.fn<() => Promise<{ userId: string } | null>>(),
  resolve: vi.fn(),
  records: vi.fn(),
  business: vi.fn(),
  overview: vi.fn(),
  training: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('REDIRECT');
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: mocks.resolve }));
vi.mock('../src/services/service-ai-training-mode', () => ({
  hasAiTrainingServiceProgram: mocks.training,
}));
vi.mock('../app/s/[serviceSlug]/manage/service-management-home-repository', () => ({
  readServiceManagementHomeRecords: mocks.records,
  readServiceBusinessActivity: mocks.business,
  readServiceCampaignOverview: mocks.overview,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ userId: 'actor-a' });
  mocks.resolve.mockResolvedValue({
    workspaceId: 'workspace-a',
    serviceId: 'service-a',
    configuration: serviceHomeFixture().configuration,
  });
});

describe('service management home access and unavailable data', () => {
  it('requires a verified user before any context or aggregate read', async () => {
    mocks.actor.mockResolvedValue(null);
    await expect(loadServiceManagementHome('training-a')).rejects.toThrow('REDIRECT');
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.records).not.toHaveBeenCalled();
  });
  it('does not query records after management is denied', async () => {
    mocks.resolve.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    await expect(loadServiceManagementHome('training-a')).rejects.toBeInstanceOf(
      ServiceManagementAccessError,
    );
    expect(mocks.records).not.toHaveBeenCalled();
  });
  it('propagates authorization-context outages instead of granting a fallback', async () => {
    mocks.resolve.mockRejectedValue(new Error('context unavailable'));
    await expect(loadServiceManagementHome('training-a')).rejects.toThrow('context unavailable');
    expect(mocks.records).not.toHaveBeenCalled();
  });
  it('returns only authorized navigation and an unavailable summary after aggregate failure', async () => {
    mocks.records.mockResolvedValue({
      group: { memberships: [], fortuneServiceSetting: null },
      socialFeedback: false,
      trainingOverview: true,
      socialOperations: false,
      summary: null,
    });
    const value = await loadServiceManagementHome('training-a');
    expect(value.summary).toBeNull();
    expect(value.visibleSections.map((s) => s.href)).toContain('settings');
    expect(value.visibleSections.map((s) => s.href)).not.toContain('post-approvals');
    expect(mocks.records).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        serviceId: 'service-a',
        aiTraining: true,
      }),
    );
    expect(mocks.business).not.toHaveBeenCalled();
  });

  describe('daily tasks for Services that use product information or campaigns', () => {
    const socialRecords = {
      group: { memberships: [], fortuneServiceSetting: null },
      socialFeedback: false,
      trainingOverview: false,
      socialOperations: true,
      now: new Date('2026-11-13T00:00:00Z'),
      summary: null,
    };
    const overview = {
      inUse: true,
      publishedProductPackCount: 1,
      openCampaignCount: 1,
      pendingPostApprovalCount: 2,
      recent: { generated: 5, accepted: 3, copied: 2, postedSelfReported: 1 },
    };
    beforeEach(() => {
      mocks.training.mockResolvedValue(false);
      mocks.records.mockResolvedValue(socialRecords);
    });

    it('shows counts only when the Service already uses product information or campaigns', async () => {
      mocks.overview.mockResolvedValue(overview);
      await expect(loadServiceManagementHome('social-a')).resolves.toMatchObject({
        campaignOverview: { state: 'READY', overview },
      });
      expect(mocks.overview).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'workspace-a', serviceId: 'service-a' }),
      );
      mocks.overview.mockResolvedValue({ ...overview, inUse: false });
      await expect(loadServiceManagementHome('social-a')).resolves.toMatchObject({
        campaignOverview: { state: 'HIDDEN' },
      });
    });

    it('does not turn an unavailable count into zero', async () => {
      mocks.overview.mockRejectedValue(new Error('database unavailable'));
      await expect(loadServiceManagementHome('social-a')).resolves.toMatchObject({
        campaignOverview: { state: 'UNAVAILABLE' },
      });
    });

    it('does not read campaign counts for training Services', async () => {
      mocks.training.mockResolvedValue(true);
      mocks.records.mockResolvedValue({ ...socialRecords, socialOperations: false });
      await expect(loadServiceManagementHome('training-a')).resolves.toMatchObject({
        campaignOverview: { state: 'HIDDEN' },
      });
      expect(mocks.overview).not.toHaveBeenCalled();
    });
  });
});
