import { describe, expect, it, vi } from 'vitest';
import {
  GetAdminOperationsSnapshot,
  GetAdminUserDetail,
  SetAdminUserStatus,
  CreateAdminSupportCase,
  type AdminOperationsRepository,
} from '../src';

function repository(): AdminOperationsRepository {
  return {
    snapshot: vi.fn().mockResolvedValue(null),
    userDetail: vi.fn().mockResolvedValue(null),
    setUserStatus: vi.fn().mockResolvedValue(null),
    createSupportCase: vi.fn().mockResolvedValue(null),
    updateSupportCase: vi.fn().mockResolvedValue(null),
    listSupportCases: vi.fn().mockResolvedValue(null),
  };
}

describe('admin operations', () => {
  it('hides the dashboard when the repository rejects the administrator', async () => {
    const useCase = new GetAdminOperationsSnapshot(repository());
    await expect(
      useCase.execute({
        actorUserId: crypto.randomUUID(),
        environment: 'PRODUCTION',
        from: new Date('2026-08-01T00:00:00Z'),
        to: new Date('2026-09-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an excessive period before reading operational data', async () => {
    const snapshot = vi.fn<AdminOperationsRepository['snapshot']>().mockResolvedValue(null);
    const repo: AdminOperationsRepository = {
      snapshot,
      userDetail: vi.fn().mockResolvedValue(null),
      setUserStatus: vi.fn().mockResolvedValue(null),
      createSupportCase: vi.fn().mockResolvedValue(null),
      updateSupportCase: vi.fn().mockResolvedValue(null),
      listSupportCases: vi.fn().mockResolvedValue(null),
    };
    const useCase = new GetAdminOperationsSnapshot(repo);
    await expect(
      useCase.execute({
        actorUserId: crypto.randomUUID(),
        environment: 'PRODUCTION',
        from: new Date('2025-01-01T00:00:00Z'),
        to: new Date('2026-09-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('rejects invalid user identifiers before reading a user', async () => {
    const userDetail = vi.fn<AdminOperationsRepository['userDetail']>().mockResolvedValue(null);
    const repo: AdminOperationsRepository = {
      snapshot: vi.fn().mockResolvedValue(null),
      userDetail,
      setUserStatus: vi.fn().mockResolvedValue(null),
      createSupportCase: vi.fn().mockResolvedValue(null),
      updateSupportCase: vi.fn().mockResolvedValue(null),
      listSupportCases: vi.fn().mockResolvedValue(null),
    };
    await expect(
      new GetAdminUserDetail(repo).execute({
        actorUserId: crypto.randomUUID(),
        userId: 'not-a-user-id',
        environment: 'PRODUCTION',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(userDetail).not.toHaveBeenCalled();
  });

  it('requires a reason before suspending a user', async () => {
    const setUserStatus = vi.fn<AdminOperationsRepository['setUserStatus']>();
    const repo = { ...repository(), setUserStatus };
    await expect(
      new SetAdminUserStatus(repo).execute({
        actorUserId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        status: 'SUSPENDED',
        reason: '短い',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(setUserStatus).not.toHaveBeenCalled();
  });

  it('normalizes a support case before saving it', async () => {
    const createSupportCase = vi
      .fn<AdminOperationsRepository['createSupportCase']>()
      .mockResolvedValue(true);
    const repo = { ...repository(), createSupportCase };
    await new CreateAdminSupportCase(repo).execute({
      actorUserId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      subject: '  ログインできない  ',
      priority: 'HIGH',
      note: '  本人確認後に再案内する  ',
    });
    expect(createSupportCase).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'ログインできない', note: '本人確認後に再案内する' }),
    );
  });
});
