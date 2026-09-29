import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const memberPages = [
  'home/page.tsx',
  'bunshins/page.tsx',
  'bunshins/new/page.tsx',
  'bunshins/[bunshinId]/page.tsx',
  'activity/page.tsx',
  'weekly-report/page.tsx',
  'roadmap/page.tsx',
  'diagnosis/page.tsx',
  '90-day-report/page.tsx',
];

describe('private service member metadata boundary', () => {
  it.each(memberPages)('does not use the public service resolver in %s', (page) => {
    const source = readFileSync(new URL(`../app/s/[serviceSlug]/${page}`, import.meta.url), 'utf8');
    expect(source).toContain('memberServiceMetadata(');
    expect(source).not.toContain('resolvePublicServiceContext');
    expect(source).not.toContain('.catch(() => null)');
  });

  it('keeps the public registration entry on the public service resolver', () => {
    const source = readFileSync(
      new URL('../app/s/[serviceSlug]/page.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('resolvePublicServiceContext(slug)');
  });
});
