import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  finishServiceMediaGeneration,
  reserveServiceMediaGeneration,
  type ServiceMediaGenerationQuotaRepository,
} from '../src/service-media-generation-quota';

const repository = (): ServiceMediaGenerationQuotaRepository => ({
  reserve: vi.fn().mockResolvedValue({ status: 'RESERVED', id: 'reservation-1' }),
  finish: vi.fn().mockResolvedValue(undefined),
});

describe('service media generation quota', () => {
  it('reserves an image slot under the exact service scope', async () => {
    const quota = repository();
    await expect(
      reserveServiceMediaGeneration({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        kind: 'IMAGE',
        operationKey: 'social-image:request-1',
        repository: quota,
      }),
    ).resolves.toEqual({ status: 'RESERVED', id: 'reservation-1' });
    expect(quota.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        kind: 'IMAGE',
        operationKey: 'social-image:request-1',
      }),
    );
  });

  it('consumes only a configured reservation', async () => {
    const quota = repository();
    await finishServiceMediaGeneration({
      reservation: { status: 'RESERVED', id: 'reservation-1' },
      outcome: 'CONSUMED',
      repository: quota,
    });
    expect(quota.finish).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 'reservation-1', outcome: 'CONSUMED' }),
    );
  });

  it('does not write for a service without a media plan', async () => {
    const quota = repository();
    await finishServiceMediaGeneration({
      reservation: { status: 'NOT_CONFIGURED', id: null },
      outcome: 'RELEASED',
      repository: quota,
    });
    expect(quota.finish).not.toHaveBeenCalled();
  });
});
