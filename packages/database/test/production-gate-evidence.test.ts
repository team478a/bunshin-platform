import { describe, expect, it, vi } from 'vitest';
import { PrismaProductionGateEvidenceRepository } from '../src';

const input = {
  environment: 'PRODUCTION' as const,
  commitSha: 'a'.repeat(40),
  checkKey: 'FINAL_APPROVAL' as const,
  action: 'RECORDED' as const,
  reason: 'すべての本番確認が完了しました。',
  evidenceUrl: null,
  actorUserId: '11111111-1111-4111-8111-111111111111',
};

function repository(checkKeys: string[]) {
  const create = vi.fn().mockResolvedValue({
    id: '22222222-2222-4222-8222-222222222222',
    ...input,
    occurredAt: new Date('2026-08-25T12:00:00.000Z'),
  });
  const transaction = vi.fn((operation: (tx: unknown) => unknown) =>
    Promise.resolve(
      operation({
        platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'admin' }) },
        productionGateEvidence: {
          findMany: vi
            .fn()
            .mockResolvedValue(checkKeys.map((checkKey) => ({ checkKey, action: 'RECORDED' }))),
          create,
        },
      }),
    ),
  );
  return {
    create,
    subject: new PrismaProductionGateEvidenceRepository({ $transaction: transaction } as never),
  };
}

const legacyChecks = [
  'BACKUP_RESTORE',
  'MIGRATION_HEALTH',
  'AUTH_SMOKE',
  'FREE_MVP_SMOKE',
  'ACCOUNT_DELETION_DRY_RUN',
  'LINE_GO_NO_GO',
];

describe('PrismaProductionGateEvidenceRepository', () => {
  it('話題調査の本番確認がなければ最終承認を保存しない', async () => {
    const { subject, create } = repository(legacyChecks);
    await expect(subject.append(input)).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('話題調査を含む全確認が揃った場合だけ最終承認を保存する', async () => {
    const { subject, create } = repository([...legacyChecks, 'TREND_RESEARCH_SMOKE']);
    await expect(subject.append(input)).resolves.toMatchObject({ checkKey: 'FINAL_APPROVAL' });
    expect(create).toHaveBeenCalledOnce();
  });
});
