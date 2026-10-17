import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonalLearningSavedExamples } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/examples/saved-examples';

describe('D-4 saved examples UI', () => {
  it('shows a bounded save form and lets the learner manage saved examples', () => {
    const html = renderToStaticMarkup(
      <PersonalLearningSavedExamples
        serviceSlug="manaberu-style"
        enrollmentId="11111111-1111-4111-8111-111111111111"
        initialItems={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            title: '返事の手本',
            content: '短く、具体的に、次の一歩を伝える。',
            createdAt: '2026-10-18T00:00:00.000Z',
          },
        ]}
      />,
    );
    expect(html).toContain('活用例を保存する');
    expect(html).toContain('返事の手本');
    expect(html).toContain('短く、具体的に、次の一歩を伝える。');
    expect(html).toContain('削除');
    expect(html).toContain('maxLength="8000"');
  });
});
