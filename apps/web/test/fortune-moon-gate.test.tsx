import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FortuneMoonGate } from '../app/s/[serviceSlug]/fortune-moon-gate';

const character = {
  id: 'selene',
  name: 'セレーネ',
  enabled: true,
  imageUrl: 'https://example.test/selene.png',
  iconUrl: 'https://example.test/selene-icon.webp',
  expressions: { result: 'https://example.test/selene-result.webp' },
};

describe('fortune moon gate', () => {
  it('uses the registered full-scale image, loading it during the gate', () => {
    const markup = renderToStaticMarkup(
      <FortuneMoonGate phase="gate" character={character} finish={() => undefined} />,
    );
    expect(markup).toContain('data-scene="gate"');
    expect(markup).toContain('src="https://example.test/selene.png"');
    expect(markup).toContain('loading="eager"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('uses the existing character display with no full-scale image', () => {
    const markup = renderToStaticMarkup(
      <FortuneMoonGate
        phase="entrance"
        character={{ ...character, imageUrl: '' }}
        finish={() => undefined}
      />,
    );
    expect(markup).toContain('src="https://example.test/selene-result.webp"');
    expect(markup).toContain('セレーネ');
  });

  it('shows a moon alone when there is no enabled character', () => {
    const markup = renderToStaticMarkup(
      <FortuneMoonGate
        phase="entrance"
        character={{ ...character, enabled: false }}
        finish={() => undefined}
      />,
    );
    expect(markup).toContain('月の案内役');
    expect(markup).not.toContain('<img');
  });
});
