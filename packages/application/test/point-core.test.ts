import { describe, expect, it, vi } from 'vitest';
import {
  ConsumePoints,
  GetPointAccount,
  GrantPoints,
  RefundPoints,
  type PointLedgerRepository,
} from '../src/point-core';

const account = {
  id: 'account-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  availablePoints: 10,
  recoveryDue: 0,
  updatedAt: new Date('2026-08-29T00:00:00Z'),
};
const transaction = {
  id: 'transaction-1',
  accountId: account.id,
  workspaceId: account.workspaceId,
  userId: account.userId,
  groupId: null,
  campaignId: null,
  type: 'GRANT' as const,
  amount: 10,
  idempotencyKey: 'event-1',
  sourceType: 'MISSION_VIEWED',
  sourceId: 'activity-1',
  ruleVersionId: null,
  expiresAt: null,
  createdAt: account.updatedAt,
};

const repository = (): PointLedgerRepository => ({
  getAccount: vi.fn().mockResolvedValue(account),
  grant: vi.fn().mockResolvedValue({ account, transaction }),
  consume: vi.fn().mockResolvedValue({
    account: { ...account, availablePoints: 5 },
    transaction: { ...transaction, type: 'CONSUME', amount: -5 },
  }),
  refund: vi.fn().mockResolvedValue({
    account,
    transaction: { ...transaction, type: 'REFUND', amount: 5 },
  }),
});

describe('point core use cases', () => {
  it('reads only through the workspace and actor scope', async () => {
    const port = repository();
    await expect(
      new GetPointAccount(port).execute({ workspaceId: 'workspace-1', actorUserId: 'user-1' }),
    ).resolves.toEqual(account);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(port.getAccount).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
    });
  });

  it('normalizes grant metadata and rejects invalid amounts', async () => {
    const port = repository();
    await new GrantPoints(port).execute({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      amount: 10,
      idempotencyKey: ' event-1 ',
      sourceType: ' MISSION_VIEWED ',
      sourceId: 'activity-1',
      groupId: null,
      campaignId: null,
      ruleVersionId: null,
      expiresAt: null,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(port.grant).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'event-1', sourceType: 'MISSION_VIEWED' }),
    );
    await expect(
      new GrantPoints(port).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        amount: 0,
        idempotencyKey: 'event-2',
        sourceType: 'MISSION_VIEWED',
        sourceId: null,
        groupId: null,
        campaignId: null,
        ruleVersionId: null,
        expiresAt: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('fails closed when consumption is unavailable', async () => {
    const port = repository();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(port.consume).mockResolvedValue(null);
    await expect(
      new ConsumePoints(port).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        amount: 50,
        idempotencyKey: 'consume-1',
        sourceType: 'IMAGE_GENERATION',
        sourceId: null,
        groupId: null,
        campaignId: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires a reason and consumption reference for refunds', async () => {
    const port = repository();
    await expect(
      new RefundPoints(port).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        consumptionTransactionId: '',
        idempotencyKey: 'refund-1',
        reason: 'provider failed',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
