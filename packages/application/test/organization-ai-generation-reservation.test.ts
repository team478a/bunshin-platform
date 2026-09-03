import { describe, expect, it, vi } from 'vitest';
import {
  FinishOrganizationAiGeneration,
  ReserveOrganizationAiGeneration,
  type OrganizationAiGenerationReservationRepository,
} from '../src/index';

describe('organization AI generation reservation', () => {
  it('reserves a short-lived monthly slot before provider execution', async () => {
    const reserve = vi.fn().mockResolvedValue({ status: 'RESERVED', reservationId: 'r-1' });
    const repository = {
      reserve,
      finish: vi.fn(),
    } satisfies OrganizationAiGenerationReservationRepository;
    const now = new Date('2026-09-03T00:00:00.000Z');
    await expect(
      new ReserveOrganizationAiGeneration(repository).execute({
        workspaceId: 'workspace-1',
        operationKey: 'weekly-plan:operation-1',
        now,
      }),
    ).resolves.toEqual({ status: 'RESERVED', reservationId: 'r-1' });
    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        operationKey: 'weekly-plan:operation-1',
        expiresAt: new Date('2026-09-03T00:15:00.000Z'),
      }),
    );
  });

  it('marks a reserved slot as consumed or releases it after failure', async () => {
    const finish = vi.fn().mockResolvedValue(true);
    const repository = {
      reserve: vi.fn(),
      finish,
    } satisfies OrganizationAiGenerationReservationRepository;
    await new FinishOrganizationAiGeneration(repository).execute({
      workspaceId: 'workspace-1',
      operationKey: 'strategy:operation-1',
      outcome: 'RELEASED',
      now: new Date('2026-09-03T00:01:00.000Z'),
    });
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'RELEASED' }));
  });
});
