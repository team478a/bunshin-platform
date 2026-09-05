import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const setup = source('app/s/[serviceSlug]/bunshins/[bunshinId]/simple-first-post-setup.tsx');
const page = source('app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx');

describe('simple service first-post setup', () => {
  it('asks members only for the posting destination and pace', () => {
    expect(setup).toContain('1. どのSNSに投稿しますか？');
    expect(setup).toContain('2. どのくらいのペースで投稿しますか？');
    expect(setup).toContain("useState<SocialPostingFrequency>('WEEKLY')");
    expect(setup).toContain("defaultAssistanceLevel: 'READY_TO_USE'");
  });

  it('prepares the existing guarded workflow in order', () => {
    const endpoints = [
      '/content-pillars',
      '/social-profiles',
      '/social-account-strategies/generate',
      '/approve',
      '/weekly-plans/generate',
      '/confirm',
      '/daily-missions/generate',
    ];
    endpoints.forEach((endpoint) => expect(setup).toContain(endpoint));
    expect(setup).toContain("goal: 'BRAND_AWARENESS'");
    expect(setup).not.toContain('post-record');
  });

  it('keeps detailed controls available without making them the primary path', () => {
    expect(page).toContain('<SimpleFirstPostSetup');
    expect(page).toContain('<details className="service-advanced-settings">');
    expect(page).toContain('細かい設定を自分で変える（必要な方だけ）');
    expect(page).toContain('id="today-post"');
  });
});
