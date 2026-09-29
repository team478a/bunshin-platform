import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../app/s/[serviceSlug]/fortune-actions', () => ({ FortuneFeedbackButtons: () => null }));

import { ReadingCard } from '../app/s/[serviceSlug]/fortune-ui';

describe('fortune failed result UI', () => {
  it('shows the approved result while AI is pending and postpones feedback', () => {
    const html = renderToStaticMarkup(
      <ReadingCard
        serviceSlug="fortune-a"
        reading={{
          id: 'reading-a',
          localDate: '2026-09-29',
          theme: 'WORK',
          cardCode: 'THE_FOOL',
          cardNameJa: '愚者',
          orientation: 'UPRIGHT',
          status: 'GENERATING',
          title: '標準結果',
          body: '承認済み本文',
          actionStep: '小さな行動',
          feedbackRating: null,
          feedbackIssue: null,
          createdAt: new Date(),
        }}
      />,
    );
    expect(html).toContain('AIが結果を整えています');
    expect(html).toContain('承認済み本文');
    expect(html).toContain('小さな行動');
  });
  it('explains failure without offering a same-day redraw', () => {
    const html = renderToStaticMarkup(
      <ReadingCard
        serviceSlug="fortune-a"
        reading={{
          id: 'reading-a',
          localDate: '2026-09-28',
          theme: 'WORK',
          cardCode: 'THE_FOOL',
          cardNameJa: '愚者',
          orientation: 'UPRIGHT',
          status: 'FAILED',
          title: null,
          body: null,
          actionStep: null,
          feedbackRating: null,
          feedbackIssue: null,
          createdAt: new Date(),
        }}
      />,
    );
    expect(html).toContain('結果を表示できませんでした');
    expect(html).toContain('今日は引き直さず');
    expect(html).toContain('明日またお試しください');
    expect(html).not.toContain('fortune-reading-body');
  });
});
