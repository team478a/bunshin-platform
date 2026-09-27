import { describe, expect, it, vi } from 'vitest';
import {
  enqueueSocialActivityOemSupportCandidateEmails,
  isSocialActivityOemSupportCandidateEmailDeliveryEligible,
} from '../src/social-activity-oem-support-candidate-email';

const now = new Date('2026-09-27T12:00:00.000Z');

function database(
  input: {
    mode?: string;
    enabled?: boolean;
    verified?: boolean;
    recipientEnabled?: boolean;
    notifyByEmail?: boolean;
  } = {},
) {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const mode = input.mode ?? 'INCLUDED_SUPPORT';
  return {
    client: {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'candidate-1' }]),
      socialActivityOemSupportCandidate: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'candidate-1',
            recommendationSnapshot: { handlingMode: mode },
            barrierCase: {
              groupMembership: {
                workspaceId: 'workspace-1',
                groupId: 'group-1',
                group: {
                  memberships: [
                    {
                      userId: 'manager-1',
                      user: { email: 'owner@example.com', displayName: '運営者' },
                      serviceNotificationPreferences:
                        input.recipientEnabled === undefined
                          ? []
                          : [{ enabled: input.recipientEnabled }],
                    },
                  ],
                  serviceConfiguration: {
                    id: 'configuration-1',
                    slug: 'sample',
                    displayName: 'サンプル',
                    registrationEmailConfiguration: {
                      id: 'email-1',
                      enabled: input.enabled ?? true,
                      lastVerifiedAt: input.verified === false ? null : now,
                      fromName: 'サンプル運営',
                      fromEmail: 'support@example.com',
                      replyToEmail: null,
                    },
                    supportAlertPolicy:
                      input.notifyByEmail === undefined
                        ? null
                        : { notifyByEmail: input.notifyByEmail },
                    messageTemplates: [],
                  },
                },
              },
            },
          },
        ]),
      },
      socialActivityOemSupportCandidateEmailDelivery: { createMany },
    },
    createMany,
  };
}

describe('enqueueSocialActivityOemSupportCandidateEmails', () => {
  it('契約内支援を有効な運営管理者へだけキューする', async () => {
    const db = database();
    await expect(
      enqueueSocialActivityOemSupportCandidateEmails(db.client as never, {
        baseUrl: 'https://example.com/',
        now,
      }),
    ).resolves.toEqual({ selected: 1, queued: 1, skipped: 0 });
    expect(db.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          candidateId: 'candidate-1',
          recipientUserId: 'manager-1',
          handlingMode: 'INCLUDED_SUPPORT',
          body: expect.stringContaining('https://example.com/s/sample/manage/personalization'),
        }),
      ],
    });
  });

  it.each([
    ['アラート停止', { mode: 'DISABLED' }],
    ['メール停止', { enabled: false }],
    ['未検証メール', { verified: false }],
    ['通知担当者の受信停止', { recipientEnabled: false }],
    ['メールチャネル停止', { notifyByEmail: false }],
  ])('%sではキューしない', async (_label, input) => {
    const db = database(input);
    await expect(
      enqueueSocialActivityOemSupportCandidateEmails(db.client as never, {
        baseUrl: 'https://example.com',
        now,
      }),
    ).resolves.toEqual({ selected: 1, queued: 0, skipped: 1 });
    expect(db.createMany).not.toHaveBeenCalled();
  });
});

function deliveryDatabase(
  input: {
    status?: 'OPEN' | 'ACCEPTED';
    mode?: string;
    notifyByEmail?: boolean;
    recipientEnabled?: boolean;
    recipientEmail?: string;
  } = {},
) {
  return {
    socialActivityOemSupportCandidate: {
      findFirst: vi.fn().mockResolvedValue(
        input.status === 'ACCEPTED'
          ? null
          : {
              recommendationSnapshot: { handlingMode: input.mode ?? 'INCLUDED_SUPPORT' },
              barrierCase: {
                workspaceId: 'workspace-1',
                groupId: 'group-1',
                groupMembership: {
                  group: {
                    memberships: [
                      {
                        userId: 'manager-1',
                        user: { email: input.recipientEmail ?? 'owner@example.com' },
                        serviceNotificationPreferences:
                          input.recipientEnabled === undefined
                            ? []
                            : [{ enabled: input.recipientEnabled }],
                      },
                    ],
                    serviceConfiguration: {
                      id: 'configuration-1',
                      supportAlertPolicy: { notifyByEmail: input.notifyByEmail ?? true },
                    },
                  },
                },
              },
            },
      ),
    },
  };
}

const delivery = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  configurationId: 'configuration-1',
  candidateId: 'candidate-1',
  recipientUserId: 'manager-1',
  recipientEmail: 'owner@example.com',
};

describe('isSocialActivityOemSupportCandidateEmailDeliveryEligible', () => {
  it('最新状態でも有効な管理者配送だけを許可する', async () => {
    await expect(
      isSocialActivityOemSupportCandidateEmailDeliveryEligible(
        deliveryDatabase() as never,
        delivery,
      ),
    ).resolves.toBe(true);
  });

  it.each([
    ['候補対応済み', { status: 'ACCEPTED' as const }],
    ['アラート停止', { mode: 'DISABLED' }],
    ['メール停止', { notifyByEmail: false }],
    ['担当解除', { recipientEnabled: false }],
    ['メール変更', { recipientEmail: 'changed@example.com' }],
  ])('%sでは送信を許可しない', async (_label, input) => {
    await expect(
      isSocialActivityOemSupportCandidateEmailDeliveryEligible(
        deliveryDatabase(input) as never,
        delivery,
      ),
    ).resolves.toBe(false);
  });
});
