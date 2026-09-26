import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const onboardingForm = source('app/s/[serviceSlug]/onboarding/service-onboarding-form.tsx');
const onboardingApi = source('src/http/service-onboarding.ts');
const proposals = source('app/s/[serviceSlug]/bunshins/new/service-bunshin-proposals.tsx');
const detailPage = source(
  'app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-view.tsx',
);
const setup = source('app/s/[serviceSlug]/bunshins/[bunshinId]/simple-first-post-setup.tsx');

describe('service first-post guided setup', () => {
  it('creates one standard business partner and shows the diagnosis before setup', () => {
    expect(onboardingApi).toContain('defaultBusinessPartner(value.businessProfile)');
    expect(onboardingApi).toContain('existing[0] ??');
    expect(onboardingForm).toContain('result.data?.bunshinId');
    expect(onboardingForm).toContain('/diagnosis`');
    expect(onboardingForm).toContain(': `/s/${encodeURIComponent(serviceSlug)}/bunshins/new`');
    expect(onboardingForm).toContain('editMode');
    expect(onboardingForm).toContain('? `/s/${encodeURIComponent(serviceSlug)}/home`');
    expect(proposals).toContain('useEffect');
  });

  it('uses large choices for known questions and keeps a free-text fallback', () => {
    expect(onboardingForm).toContain('serviceOnboardingChoicePreset(question)');
    expect(onboardingForm).toContain('aria-pressed={selections[index] === option}');
    expect(onboardingForm).toContain('preset.otherLabel');
    expect(onboardingForm).toContain('if (!preset)');
  });

  it('opens the created partner directly instead of returning to the list', () => {
    expect(proposals).toContain('result.data?.id');
    expect(proposals).toContain('encodeURIComponent(bunshinId)');
    expect(proposals).toContain('?setup=1');
  });

  it('starts automatic preparation while leaving SNS posting to the member', () => {
    expect(detailPage).toContain('迷ったときは「今日やること」だけ進めれば大丈夫です。');
    expect(setup).toContain('LINE配信を始める');
    expect(setup).toContain('SNSへの投稿はご自身で行います');
  });
});
