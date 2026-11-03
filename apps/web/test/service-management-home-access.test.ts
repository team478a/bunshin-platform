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
});
