import { describe, expect, it, vi } from 'vitest';
import { RecordProductionGateEvidence, type ProductionGateEvidenceRepository } from '../src';

const evidence = {
  id: 'evidence-1',
  environment: 'PRODUCTION' as const,
  checkKey: 'AUTH_SMOKE' as const,
  commitSha: 'a'.repeat(40),
  action: 'RECORDED' as const,
  reason: 'LINEとメールの両方を実端末で確認しました。',
  evidenceUrl: 'https://github.com/team478a/bunshin-platform/actions/runs/1',
  actorUserId: 'admin-1',
  occurredAt: new Date(0),
};
const repository = (
  append = vi.fn().mockResolvedValue(evidence),
): ProductionGateEvidenceRepository => ({
  list: () => Promise.resolve([]),
  append,
});

describe('production gate evidence', () => {
  it('normalizes and records an allowlisted HTTPS evidence URL', async () => {
    const append = vi.fn().mockResolvedValue(evidence);
    await new RecordProductionGateEvidence(repository(append)).execute({
      actorUserId: 'admin-1',
      environment: 'PRODUCTION',
      commitSha: 'a'.repeat(40),
      checkKey: 'AUTH_SMOKE',
      action: 'RECORDED',
      reason: ' LINEとメールの両方を実端末で確認しました。 ',
      evidenceUrl: evidence.evidenceUrl,
    });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ reason: evidence.reason }));
  });

  it('rejects an unknown host and an invalid commit', async () => {
    const useCase = new RecordProductionGateEvidence(repository());
    await expect(
      useCase.execute({
        ...evidence,
        evidenceUrl: 'https://example.com/private',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(useCase.execute({ ...evidence, commitSha: 'main' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('does not disguise a rejected final approval as success', async () => {
    await expect(
      new RecordProductionGateEvidence(repository(vi.fn().mockResolvedValue(null))).execute({
        ...evidence,
        checkKey: 'FINAL_APPROVAL',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
