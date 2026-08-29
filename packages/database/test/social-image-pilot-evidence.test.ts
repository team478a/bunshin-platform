import { describe, expect, it, vi } from 'vitest';
import { PrismaSocialImagePilotEvidenceRepository } from '../src';

const input = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  pilotId: '33333333-3333-4333-8333-333333333333',
  checkKey: 'FINAL_APPROVAL' as const,
  action: 'RECORDED' as const,
  reason: '画像生成パイロットを開始できることを最終確認しました。',
  evidenceUrl: null,
  actorUserId: '44444444-4444-4444-8444-444444444444',
  occurredAt: new Date('2026-08-30T08:00:00.000Z'),
};

type EvidenceState = { checkKey: string; action: 'RECORDED' | 'REVOKED' };

function repository(states: EvidenceState[], options?: { pilotExists?: boolean }) {
  const create = vi.fn().mockResolvedValue({
    id: '55555555-5555-4555-8555-555555555555',
    ...input,
  });
  const findPilot = vi
    .fn()
    .mockResolvedValue(options?.pilotExists === false ? null : { id: input.pilotId });
  const transaction = vi.fn((operation: (tx: unknown) => unknown) =>
    Promise.resolve(
      operation({
        platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'admin' }) },
        socialImageGenerationPilot: { findFirst: findPilot },
        socialImagePilotEvidence: {
          findMany: vi.fn().mockResolvedValue(states),
          create,
        },
      }),
    ),
  );
  return {
    create,
    findPilot,
    subject: new PrismaSocialImagePilotEvidenceRepository({ $transaction: transaction } as never),
  };
}

const requiredStates: EvidenceState[] = [
  'PLAN_APPROVAL',
  'STORAGE_RETENTION',
  'MOBILE_E2E',
  'SECURITY_ISOLATION',
  'TEN_THEME_VALIDATION',
].map((checkKey) => ({ checkKey, action: 'RECORDED' }));

describe('PrismaSocialImagePilotEvidenceRepository', () => {
  it('5項目が揃うまで最終承認を保存しない', async () => {
    const { subject, create } = repository(requiredStates.slice(0, 4));
    await expect(subject.append(input)).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('最新の確認が取り消されている項目があれば最終承認を保存しない', async () => {
    const { subject, create } = repository([
      ...requiredStates,
      { checkKey: 'MOBILE_E2E', action: 'REVOKED' },
    ]);
    await expect(subject.append(input)).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('5項目の最新状態が確認済みの場合だけ最終承認を保存する', async () => {
    const { subject, create } = repository(requiredStates);
    await expect(subject.append(input)).resolves.toMatchObject({ checkKey: 'FINAL_APPROVAL' });
    expect(create).toHaveBeenCalledOnce();
  });

  it('対象グループのパイロットが存在しなければ保存しない', async () => {
    const { subject, create, findPilot } = repository(requiredStates, { pilotExists: false });
    await expect(subject.append(input)).resolves.toBeNull();
    expect(findPilot).toHaveBeenCalledWith({
      where: { id: input.pilotId, workspaceId: input.workspaceId, groupId: input.groupId },
      select: { id: true },
    });
    expect(create).not.toHaveBeenCalled();
  });
});
