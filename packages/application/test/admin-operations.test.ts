import { describe, expect, it, vi } from 'vitest';
import {
  GetAdminOperationsSnapshot,
  GetAdminUserDetail,
  type AdminOperationsRepository,
} from '../src';

function repository(): AdminOperationsRepository {
  return {
    snapshot: vi.fn().mockResolvedValue(null),
    userDetail: vi.fn().mockResolvedValue(null),
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
});
