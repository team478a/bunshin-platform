import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const onboardingForm = source('app/s/[serviceSlug]/onboarding/service-onboarding-form.tsx');
const proposals = source('app/s/[serviceSlug]/bunshins/new/service-bunshin-proposals.tsx');
const detailPage = source('app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx');
const setup = source('app/s/[serviceSlug]/bunshins/[bunshinId]/simple-first-post-setup.tsx');

describe('service first-post guided setup', () => {
  it('continues from onboarding directly to personalized partner proposals', () => {
    expect(onboardingForm).toContain('/bunshins/new`');
    expect(onboardingForm).not.toContain('/home`');
    expect(proposals).toContain('useEffect');
    expect(proposals).toContain('void propose()');
    expect(proposals).toContain('回答をもとに、あなた向けの投稿パートナーを準備しています');
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
    expect(detailPage).toContain('初回設定のあとは、投稿案を自動で準備してLINEでお知らせします。');
    expect(setup).toContain('この設定で自動のお届けを始める');
    expect(setup).toContain('SNSへの投稿はご自身で行います');
  });
});
