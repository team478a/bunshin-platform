import { describe, expect, it, vi } from 'vitest';
import { ListAdminAuditLogs, type AdminAuditLogRepository } from '../src';

describe('admin audit log', () => {
  it('rejects an unknown category before reading data', async () => {
    const list = vi.fn<AdminAuditLogRepository['list']>();
    await expect(
      new ListAdminAuditLogs({ list }).execute({
        actorUserId: crypto.randomUUID(),
        environment: 'PRODUCTION',
        from: new Date('2026-08-01T00:00:00Z'),
        to: new Date('2026-09-01T00:00:00Z'),
        category: 'SECRET_VALUES',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(list).not.toHaveBeenCalled();
  });

  it('hides audit data when the repository rejects the administrator', async () => {
    const repository: AdminAuditLogRepository = { list: vi.fn().mockResolvedValue(null) };
    await expect(
      new ListAdminAuditLogs(repository).execute({
        actorUserId: crypto.randomUUID(),
        environment: 'PRODUCTION',
        from: new Date('2026-08-01T00:00:00Z'),
        to: new Date('2026-09-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
