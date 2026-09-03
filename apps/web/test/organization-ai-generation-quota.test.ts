import type { OrganizationAiGenerationReservationRepository } from '@bunshin/application';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { withOrganizationAiGenerationQuota } from '../src/organization-ai-generation-quota';

const workspaceId = '98a31509-e0d9-473a-b374-890623a4b7d0';

function repository(status: 'RESERVED' | 'ALREADY_RESERVED' | 'UNLIMITED' | 'EXHAUSTED') {
  const reserve = vi.fn().mockResolvedValue({
    status,
    reservationId: status === 'RESERVED' || status === 'ALREADY_RESERVED' ? 'reservation-1' : null,
  });
  const finish = vi.fn().mockResolvedValue(true);
  return { reserve, finish } satisfies OrganizationAiGenerationReservationRepository;
}

describe('organization AI generation quota', () => {
  it('consumes a newly reserved slot after generation succeeds', async () => {
    const quota = repository('RESERVED');
    const generate = vi.fn().mockResolvedValue('generated');

    await expect(
      withOrganizationAiGenerationQuota({
        workspaceId,
        operationKey: 'weekly-plan:request-1',
        repository: quota,
        generate,
      }),
    ).resolves.toBe('generated');

    expect(quota.finish).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'CONSUMED', operationKey: 'weekly-plan:request-1' }),
    );
  });

  it('releases a newly reserved slot after generation fails', async () => {
    const quota = repository('RESERVED');
    const failure = new Error('provider failed');

    await expect(
      withOrganizationAiGenerationQuota({
        workspaceId,
        operationKey: 'daily-content:request-1',
        repository: quota,
        generate: () => Promise.reject(failure),
      }),
    ).rejects.toBe(failure);

    expect(quota.finish).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'RELEASED', operationKey: 'daily-content:request-1' }),
    );
  });

  it('rejects exhausted organizations before calling the provider', async () => {
    const quota = repository('EXHAUSTED');
    const generate = vi.fn();

    await expect(
      withOrganizationAiGenerationQuota({
        workspaceId,
        operationKey: 'strategy:request-1',
        repository: quota,
        generate,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(generate).not.toHaveBeenCalled();
    expect(quota.finish).not.toHaveBeenCalled();
  });

  it('does not finish a slot owned by an earlier idempotent request', async () => {
    const quota = repository('ALREADY_RESERVED');

    await withOrganizationAiGenerationQuota({
      workspaceId,
      operationKey: 'trend:request-1',
      repository: quota,
      generate: () => Promise.resolve('generated'),
    });

    expect(quota.finish).not.toHaveBeenCalled();
  });
});
