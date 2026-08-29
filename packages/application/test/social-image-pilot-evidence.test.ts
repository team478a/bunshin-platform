import { describe, expect, it, vi } from 'vitest';
import { RecordSocialImagePilotEvidence, type SocialImagePilotEvidenceRepository } from '../src';

const record = {
  id: 'evidence-1',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  pilotId: '33333333-3333-4333-8333-333333333333',
  actorUserId: '44444444-4444-4444-8444-444444444444',
  checkKey: 'PLAN_APPROVAL' as const,
  action: 'RECORDED' as const,
  reason: '予算、評価担当者、期間、対象者を確認しました。',
  evidenceUrl: 'https://github.com/team478a/bunshin-platform/actions/runs/1',
  occurredAt: new Date(),
};

const repository = (append = vi.fn().mockResolvedValue(record)) =>
  ({ list: vi.fn(), append }) satisfies SocialImagePilotEvidenceRepository;

describe('social image pilot evidence', () => {
  it('理由を整形し許可された証跡URLだけを保存する', async () => {
    const append = vi.fn().mockResolvedValue(record);
    await new RecordSocialImagePilotEvidence(repository(append)).execute({
      ...record,
      reason: ` ${record.reason} `,
    });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ reason: record.reason }));
  });

  it('秘密値を含み得るURL形式と未許可hostを拒否する', async () => {
    const useCase = new RecordSocialImagePilotEvidence(repository());
    await expect(
      useCase.execute({ ...record, evidenceUrl: 'https://user:secret@github.com/run' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      useCase.execute({ ...record, evidenceUrl: 'https://example.com/result' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('前提不足で最終承認が拒否されたことを成功扱いにしない', async () => {
    await expect(
      new RecordSocialImagePilotEvidence(repository(vi.fn().mockResolvedValue(null))).execute({
        ...record,
        checkKey: 'FINAL_APPROVAL',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
