import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rendererSource = readFileSync(
  new URL('../src/social-image-renderer.ts', import.meta.url),
  'utf8',
);
const editorialSource = readFileSync(
  new URL('../src/social-image-editorial-layouts.ts', import.meta.url),
  'utf8',
);
const primitivesSource = readFileSync(
  new URL('../src/social-image-renderer-primitives.ts', import.meta.url),
  'utf8',
);

describe('social image renderer layout boundary', () => {
  it('keeps the existing headline helper export stable', () => {
    expect(rendererSource).toContain(
      "export { editorialHeadline } from './social-image-editorial-layouts';",
    );
  });

  it('delegates editorial layouts to their dedicated module', () => {
    expect(rendererSource).toContain("from './social-image-editorial-layouts'");
    expect(editorialSource).toContain('export const editorialCoverTree');
    expect(editorialSource).toContain('export const editorialTextPageTree');
    expect(rendererSource).not.toContain('const editorialCoverTree');
    expect(rendererSource).not.toContain('const editorialTextPageTree');
  });

  it('shares renderer primitives without depending on the renderer facade', () => {
    expect(rendererSource).toContain("from './social-image-renderer-primitives'");
    expect(editorialSource).toContain("from './social-image-renderer-primitives'");
    expect(primitivesSource).toContain('export const positioned');
    expect(primitivesSource).not.toContain("from './social-image-renderer'");
    expect(editorialSource).not.toContain("from './social-image-renderer'");
  });
});
