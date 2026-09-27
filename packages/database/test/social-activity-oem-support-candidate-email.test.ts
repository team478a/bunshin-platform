import { describe, expect, it, vi } from 'vitest';
import { enqueueSocialActivityOemSupportCandidateEmails } from '../src/social-activity-oem-support-candidate-email';

const now = new Date('2026-09-27T12:00:00.000Z');

function database(input: { mode?: string; enabled?: boolean; verified?: boolean } = {}) {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
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
                      userId: 'manager-1',
                      user: { email: 'owner@example.com', displayName: '運営者' },
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
