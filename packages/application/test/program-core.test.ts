import { describe, expect, it, vi } from 'vitest';
import { ProgramCoreService } from '../src/program-core';
import type { ProgramCoreRepository } from '../src/program-core';

const repository = () => {
  const mocks = {
    createTemplate: vi.fn<ProgramCoreRepository['createTemplate']>(),
    createTemplateVersion: vi.fn<ProgramCoreRepository['createTemplateVersion']>(),
    adoptProgram: vi.fn<ProgramCoreRepository['adoptProgram']>(),
    createOffering: vi.fn<ProgramCoreRepository['createOffering']>(),
    enroll: vi.fn<ProgramCoreRepository['enroll']>(),
    findEnrollment: vi.fn<ProgramCoreRepository['findEnrollment']>(),
  };
  return { repo: mocks satisfies ProgramCoreRepository, mocks };
};

describe('ProgramCoreService', () => {
  it('separates platform templates from service-owned private templates', async () => {
    const { repo, mocks } = repository();
    const service = new ProgramCoreService(repo);
    await expect(
      service.createTemplate({
        workspaceId: 'workspace-a',
        actorUserId: 'user-a',
        ownerGroupId: 'service-a',
        name: '公式プログラム',
        description: '説明',
        category: 'SNS',
        targetAudience: '初心者',
        visibility: 'PLATFORM',
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.createTemplate).not.toHaveBeenCalled();
  });

  it('rejects a paid offering without an external price reference', async () => {
    const { repo, mocks } = repository();
    const service = new ProgramCoreService(repo);
    await expect(
      service.createOffering({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'manager-a',
        serviceProgramId: 'program-a',
        isFree: false,
        priceReference: null,
        responsibilities: {
          seller: 'SERVICE',
          priceOwner: 'SERVICE',
          paymentOwner: 'SERVICE',
          apiCostOwner: 'SERVICE',
          supportOwner: 'SERVICE',
          contentOwner: 'SERVICE',
          characterOwner: 'SERVICE',
        },
        termsSnapshot: {},
        startsAt: null,
        endsAt: null,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.createOffering).not.toHaveBeenCalled();
  });

  it('passes every tenant key when reading an enrollment', async () => {
    const { repo, mocks } = repository();
    mocks.findEnrollment.mockResolvedValue(null);
    const service = new ProgramCoreService(repo);
    await expect(
      service.findEnrollment({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'user-a',
        groupMembershipId: 'membership-a',
        serviceProgramId: 'program-a',
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(mocks.findEnrollment).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      actorUserId: 'user-a',
      groupMembershipId: 'membership-a',
      serviceProgramId: 'program-a',
    });
  });
});
