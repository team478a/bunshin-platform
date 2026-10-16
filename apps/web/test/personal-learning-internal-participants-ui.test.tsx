import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  InternalParticipantsCard,
  participantSnapshot,
} from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/internal-participants-card';

afterEach(() => vi.unstubAllGlobals());

describe('internal pilot participant seat UI', () => {
  it('explains invitation, normal enrollment, explicit seat grant, and does not mutate on render', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const html = renderToStaticMarkup(<InternalParticipantsCard serviceSlug="manaberu-style" />);
    expect(html).toContain('LINEの招待URL');
    expect(html).toContain('通常のプログラム管理画面');
    expect(html).toContain('内部研修枠を付与');
    expect(html).toContain('参加者と枠の状態を確認');
    expect(html).not.toContain('checked=""');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('validates the scoped participant receipt and rejects malformed rows', () => {
    expect(
      participantSnapshot({
        policy: {
          revision: 2,
          internalParticipantCap: 3,
          currentWave: 0,
        },
        seats: [
          {
            programEnrollmentId: 'enrollment-a',
            kind: 'INTERNAL',
            revokedAt: null,
          },
        ],
        enrollments: [{ id: 'enrollment-b', name: 'Tester B' }],
      }),
    ).toMatchObject({
      policy: { revision: 2, internalParticipantCap: 3, currentWave: 0 },
      seats: [{ programEnrollmentId: 'enrollment-a', kind: 'INTERNAL', revokedAt: null }],
      enrollments: [{ id: 'enrollment-b', name: 'Tester B' }],
    });
    expect(participantSnapshot({ policy: {}, seats: [], enrollments: [] })).toBeNull();
    expect(
      participantSnapshot({
        policy: null,
        seats: [{ programEnrollmentId: 'x', kind: 'BAD', revokedAt: null }],
        enrollments: [],
      }),
    ).toBeNull();
  });
});
