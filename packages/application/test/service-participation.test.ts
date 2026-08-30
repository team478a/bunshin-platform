import { describe, expect, it, vi } from 'vitest';
import { ServiceParticipationService, type ServiceParticipationRepository } from '../src';

const membership = {
  id: 'membership-1',
  workspaceId: 'workspace-1',
  groupId: 'service-1',
  userId: 'user-1',
  role: 'PARTICIPANT' as const,
  status: 'PENDING_APPROVAL' as const,
  consentedAt: new Date(),
  declinedAt: null,
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const repository = (): ServiceParticipationRepository => ({
  findView: vi.fn(() => Promise.resolve(null)),
  request: vi.fn(() => Promise.resolve(membership)),
  approve: vi.fn(() => Promise.resolve({ ...membership, status: 'ACTIVE' as const })),
});

describe('ServiceParticipationService', () => {
  it('returns the current service participation view', async () => {
    const view = {
      registrationMode: 'PUBLIC' as const,
      membership: null,
      legalDocuments: [],
    };
    const findView = vi.fn(() => Promise.resolve(view));
    const service = new ServiceParticipationService({ ...repository(), findView });
    await expect(
      service.findView({ slug: 'side-job-support', actorUserId: 'user-1' }),
    ).resolves.toEqual(view);
    expect(findView).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'side-job-support', actorUserId: 'user-1' }),
    );
  });

  it('requests participation without accepting a client supplied service ID', async () => {
    const request = vi.fn(() => Promise.resolve(membership));
    const repo: ServiceParticipationRepository = { ...repository(), request };
    const service = new ServiceParticipationService(repo);
    await service.request({
      slug: 'side-job-support',
      actorUserId: 'user-1',
      legalDocumentIds: ['terms-1', 'privacy-1'],
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'side-job-support',
        actorUserId: 'user-1',
        legalDocumentIds: ['terms-1', 'privacy-1'],
        now: expect.any(Date),
      }),
    );
  });

  it('rejects duplicate consent documents', async () => {
    await expect(
      new ServiceParticipationService(repository()).request({
        slug: 'service',
        actorUserId: 'user-1',
        legalDocumentIds: ['terms-1', 'terms-1'],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires an auditable approval reason', async () => {
    await expect(
      new ServiceParticipationService(repository()).approve({
        workspaceId: 'workspace-1',
        serviceId: 'service-1',
        groupMembershipId: 'membership-1',
        actorUserId: 'manager-1',
        reason: 'OK',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
