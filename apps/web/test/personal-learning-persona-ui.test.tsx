import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonalLearningPersonaCard } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/persona/persona-card';

describe('D-3 learner persona review UI', () => {
  it('labels guesses, links evidence, supports review/edit/reject/delete, and leaves re-inference policy undecided', () => {
    const html = renderToStaticMarkup(
      <PersonalLearningPersonaCard
        serviceSlug="manaberu-style"
        enrollmentId="11111111-1111-4111-8111-111111111111"
        initialItems={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            attributeKey: 'preferred_learning_style',
            value: '短い例を先に見る',
            status: 'UNCONFIRMED',
            evidenceType: 'LEARNING_REQUEST',
            evidenceId: '33333333-3333-4333-8333-333333333333',
            evidenceCreatedAt: '2026-10-17T00:00:00.000Z',
            evidenceHref:
              '/s/manaberu-style/programs/11111111-1111-4111-8111-111111111111/learning-request?topicId=44444444-4444-4444-8444-444444444444#learning-request-record',
          },
        ]}
      />,
    );
    expect(html).toContain('AIによる推測');
    expect(html).toContain('根拠になった学習テーマの記録を開く');
    expect(html).toContain('修正して確認');
    expect(html).toContain('この内容で確認');
    expect(html).toContain('違う');
    expect(html).toContain('削除');
    expect(html).toContain('案A');
    expect(html).toContain('案B');
    expect(html).toContain('決定待ち');
  });
});
