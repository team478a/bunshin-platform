import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImprovementFeedbackForm } from '../app/ui/improvement-feedback-form';

describe('trouble feedback form structure (not a browser E2E)', () => {
  it('renders bounded mobile inputs, privacy notice and accessible receipt status', () => {
    const html = renderToStaticMarkup(<ImprovementFeedbackForm endpoint="/api/fixture" />);
    expect(html).toContain('name="category"');
    expect(html).toContain('name="surface"');
    expect(html).toContain('name="impact"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('写真・文章・個人情報は送信しません');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('type="file"');
  });
  it('connects the actual member home only for an owning actor with active SOCIAL', () => {
    const source = readFileSync(
      new URL(
        '../app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-view.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).toContain('bunshin.ownerUserId === actor.userId');
    expect(source).toContain("capabilityType === 'SOCIAL' && status === 'ACTIVE'");
    expect(source).toContain('/improvement-feedback`');
    expect(source).toContain('key={`${service.serviceId}:${bunshin.id}`}');
  });
});
