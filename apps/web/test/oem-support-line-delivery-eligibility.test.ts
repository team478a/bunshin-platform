import { describe, expect, it, vi } from 'vitest';
import { revalidateOemSupportLineRecipients } from '../src/jobs/oem-support-line-delivery-eligibility';

const broadcast = {
  id: 'broadcast-1',
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  message: 'message',
  segmentCriteria: { kind: 'OEM_SUPPORT_CANDIDATE', candidateId: 'candidate-1' },
  updatedByUserId: 'manager-1',
};
const recipients = [
  {
    id: 'recipient-1',
    groupMembershipId: 'membership-1',
    userId: 'manager-1',
    message: null,
  },
];

function database(input: { open?: boolean; notifyByLine?: boolean; preference?: boolean } = {}) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findFirst = vi.fn().mockResolvedValue(
    input.open === false
      ? null
      : {
          recommendationSnapshot: { handlingMode: 'INCLUDED_SUPPORT' },
          barrierCase: {
            workspaceId: 'workspace-1',
            groupId: 'group-1',
            groupMembership: {
              group: {
                serviceConfiguration: {
                  supportAlertPolicy: { notifyByLine: input.notifyByLine ?? true },
                },
                memberships: [
                  {
                    id: 'membership-1',
                    userId: 'manager-1',
                    serviceNotificationPreferences:
                      input.preference === undefined
                        ? []
                        : [
                            {
                              enabled: input.preference,
                              consentedAt: input.preference ? new Date() : null,
                            },
                          ],
                  },
                ],
              },
            },
          },
        },
  );
  return {
    db: {
      prisma: {
        socialActivityOemSupportCandidate: { findFirst },
        serviceLineBroadcastRecipient: { updateMany },
      },
    },
    findFirst,
    updateMany,
  };
}

describe('revalidateOemSupportLineRecipients', () => {
  it('最新状態でも有効な運営管理者だけを残す', async () => {
    const client = database();
    await expect(
      revalidateOemSupportLineRecipients({
        db: client.db as never,
        broadcast,
        recipients,
      }),
    ).resolves.toEqual({ applies: true, recipients, skipped: 0 });
    expect(client.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['候補対応済み', { open: false }],
    ['LINE通知停止', { notifyByLine: false }],
    ['担当者の受信停止', { preference: false }],
  ])('%sではProvider送信対象から外す', async (_label, input) => {
    const client = database(input);
    await expect(
      revalidateOemSupportLineRecipients({
        db: client.db as never,
        broadcast,
        recipients,
      }),
    ).resolves.toEqual({ applies: true, recipients: [], skipped: 1 });
    expect(client.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { in: ['recipient-1'] }, status: 'PENDING' }),
      data: { status: 'SKIPPED', errorCategory: 'NOTIFICATION_NO_LONGER_ELIGIBLE' },
    });
  });

  it('一般Broadcastの受信者には追加判定を適用しない', async () => {
    const client = database();
    await expect(
      revalidateOemSupportLineRecipients({
        db: client.db as never,
        broadcast: { ...broadcast, segmentCriteria: {} },
        recipients,
      }),
    ).resolves.toEqual({ applies: false, recipients, skipped: 0 });
    expect(client.findFirst).not.toHaveBeenCalled();
  });
});
