import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
import { DeferRefinementButton } from '../app/s/[serviceSlug]/onboarding/defer-refinement-button';
import { ProfileRefinementSection } from '../app/s/[serviceSlug]/home/service-home-overview-sections';
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('onboarding refinement participant UI', () => {
  it('offers an explicit non-submit deferral and explains the seven-day pause', () => {
    const html = renderToStaticMarkup(
      <DeferRefinementButton serviceSlug="hassy" question="目的は？" />,
    );
    expect(html).toContain('あとで答える');
    expect(html).toContain('7日間');
    expect(html).toContain('type="button"');
  });
  it('keeps answer and deferral actions together on the home card', () => {
    const html = renderToStaticMarkup(
      <ProfileRefinementSection serviceSlug="hassy" question="目的は？" />,
    );
    expect(html).toContain('/s/hassy/onboarding?refine=1');
    expect(html).toContain('目的は？');
    expect(html).toContain('あとで答える');
  });
  it('allows manual editing independently of refinement cooldown and protects initial signup', () => {
    const page = source('app/s/[serviceSlug]/onboarding/page.tsx');
    expect(page).toContain('onboardingComplete &&');
    expect(page).toContain('const refinement = refining');
    expect(page).toContain('if (refining && !refinement) redirect');
    expect(source('app/(app)/account/page.tsx')).toContain('/onboarding?edit=1');
    expect(source('app/s/[serviceSlug]/onboarding/service-onboarding-form.tsx')).toContain(
      'disabled={saving}',
    );
  });
});
