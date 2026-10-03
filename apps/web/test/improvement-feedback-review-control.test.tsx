import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FeedbackReviewControl,
  feedbackReviewButtonLabel,
} from '../app/s/[serviceSlug]/manage/improvement-feedback/feedback-review-control';

describe('feedback review terminal label regression', () => {
  for (const done of ['RECORDED', 'RELOAD_REQUIRED'] as const) {
    for (const busy of [false, true]) {
      for (const uncertain of [false, true]) {
        it(`${done} overrides busy=${busy} uncertain=${uncertain}`, () => {
          expect(feedbackReviewButtonLabel({ done, busy, uncertain, prepared: true })).toBe(
            done === 'RECORDED' ? '記録済み' : '画面更新が必要',
          );
        });
      }
    }
  }
  it('keeps pending, uncertain, prepared and initial labels distinct', () => {
    expect(
      feedbackReviewButtonLabel({ done: null, busy: true, uncertain: true, prepared: true }),
    ).toBe('確認中…');
    expect(
      feedbackReviewButtonLabel({ done: null, busy: false, uncertain: true, prepared: true }),
    ).toBe('同じ内容で再送');
    expect(
      feedbackReviewButtonLabel({ done: null, busy: false, uncertain: false, prepared: true }),
    ).toBe('判断を確定');
    expect(
      feedbackReviewButtonLabel({ done: null, busy: false, uncertain: false, prepared: false }),
    ).toBe('確認を始める');
  });
});
describe('feedback review control initial SSR (not interactive browser E2E)', () => {
  it('starts with a non-submit explicit prepare button, accessible status, and no private handles in HTML', () => {
    const html = renderToStaticMarkup(
      <FeedbackReviewControl endpoint="/api/fixture" selectionHandle="PRIVATE_ENCRYPTED_HANDLE" />,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('確認を始める');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('PRIVATE_');
    expect(html).not.toContain('判断を確定');
  });
});
