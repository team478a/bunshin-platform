import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeedbackReviewControl } from '../app/s/[serviceSlug]/manage/improvement-feedback/feedback-review-control';
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
