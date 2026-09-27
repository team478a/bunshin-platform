import { describe, expect, it, vi } from 'vitest';
import { scheduleSocialActivityOemSupportCandidateLines } from '../src/social-activity-oem-support-candidate-line';

const now = new Date('2026-09-27T12:00:00.000Z');

function database(
  input: {
    mode?: string;
    notifyByLine?: boolean;
    recipientEnabled?: boolean;
    recipientConsented?: boolean;
    existing?: boolean;
  } = {},
) {
  const createBroadcast = vi.fn().mockResolvedValue({ id: 'broadcast-1' });
  const createRecipients = vi.fn().mockResolvedValue({ count: 1 });
  const createAudit = vi.fn().mockResolvedValue({ id: 'audit-1' });
  const tx = {
    serviceLineBroadcast: {
      findUnique: vi.fn().mockResolvedValue(
        input.existing
          ? {
              id: 'broadcast-1',
              workspaceId: 'workspace-1',
              updatedByUserId: 'manager-1',
              scheduledAt: now,
            }
          : null,
      ),
      create: createBroadcast,
    },
    serviceLineBroadcastRecipient: { createMany: createRecipients },
    serviceLineBroadcastAuditLog: { create: createAudit },
  };
  const mode = input.mode ?? 'INCLUDED_SUPPORT';
  return {
    client: {
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
                      id: 'membership-1',
                      userId: 'manager-1',
                      user: { displayName: '運営者' },
                      serviceNotificationPreferences:
                        input.recipientEnabled === undefined
                          ? []
                          : [
                              {
                                enabled: input.recipientEnabled,
                                consentedAt: input.recipientConsented === false ? null : now,
                              },
                            ],
                    },
                  ],
                  serviceConfiguration: {
                    slug: 'sample',
                    displayName: 'サンプル',
                    supportAlertPolicy: { notifyByLine: input.notifyByLine ?? true },
                    messageTemplates: [
                      {
                        body: '{{name}}さん、{{serviceName}}の{{supportType}}を確認してください。{{manageUrl}}',
                      },
                    ],
                  },
                },
              },
            },
          },
        ]),
      },
      $transaction: vi.fn((callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    },
    createBroadcast,
    createRecipients,
    createAudit,
  };
}

describe('scheduleSocialActivityOemSupportCandidateLines', () => {
  it('運営管理者向けの既存LINE broadcastを作る', async () => {
    const db = database();
    const result = await scheduleSocialActivityOemSupportCandidateLines(db.client as never, {
      baseUrl: 'https://example.com/',
      environment: 'PRODUCTION',
      now,
    });
    expect(result).toMatchObject({ selected: 1, scheduled: 1, existing: 0, skipped: 0 });
    expect(db.createBroadcast).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        automationKey: 'oem-support-candidate:candidate-1',
        message: expect.stringContaining('https://example.com/s/sample/manage/personalization'),
      }),
      select: { id: true },
    });
    expect(db.createRecipients).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'manager-1',
          message: expect.stringContaining('運営者さん、サンプルの契約内サポート'),
        }),
      ],
    });
    expect(db.createAudit).toHaveBeenCalledOnce();
  });

  it('同じ候補のbroadcastがあれば再作成しない', async () => {
    const db = database({ existing: true });
    await expect(
      scheduleSocialActivityOemSupportCandidateLines(db.client as never, {
        baseUrl: 'https://example.com',
        environment: 'PRODUCTION',
        now,
      }),
    ).resolves.toMatchObject({ scheduled: 0, existing: 1 });
    expect(db.createBroadcast).not.toHaveBeenCalled();
    expect(db.createRecipients).not.toHaveBeenCalled();
  });

  it.each([
    ['通知設定OFF', { notifyByLine: false }],
    ['アラート停止', { mode: 'DISABLED' }],
    ['受信停止', { recipientEnabled: false }],
    ['同意なし', { recipientEnabled: true, recipientConsented: false }],
  ])('%sでは作成しない', async (_label, options) => {
    const db = database(options);
    await expect(
      scheduleSocialActivityOemSupportCandidateLines(db.client as never, {
        baseUrl: 'https://example.com',
        environment: 'PRODUCTION',
        now,
      }),
    ).resolves.toMatchObject({ scheduled: 0, skipped: 1 });
    expect(db.createBroadcast).not.toHaveBeenCalled();
  });
});
