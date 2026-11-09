import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ServiceNotFoundCard } from '../app/s/[serviceSlug]/service-not-found-card';

describe('service-scoped not found guidance', () => {
  it('keeps the service slug in both the home and login recovery paths', () => {
    const html = renderToStaticMarkup(<ServiceNotFoundCard serviceSlug="manaberu-style" />);

    expect(html).toContain('href="/s/manaberu-style/home"');
    expect(html).toContain('href="/login?returnTo=%2Fs%2Fmanaberu-style%2Fhome"');
    expect(html).toContain('サービスホームへ戻る');
    expect(html).not.toContain('href="/"');
  });
});
