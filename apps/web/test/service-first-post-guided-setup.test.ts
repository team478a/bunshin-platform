import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const onboardingForm = source('app/s/[serviceSlug]/onboarding/service-onboarding-form.tsx');
const proposals = source('app/s/[serviceSlug]/bunshins/new/service-bunshin-proposals.tsx');
const detailPage = source('app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx');

describe('service first-post guided setup', () => {
  it('continues from onboarding directly to personalized partner proposals', () => {
    expect(onboardingForm).toContain('/bunshins/new`');
    expect(onboardingForm).not.toContain('/home`');
    expect(proposals).toContain('useEffect');
    expect(proposals).toContain('void propose()');
    expect(proposals).toContain('回答をもとに、あなた向けの投稿パートナーを準備しています');
  });

  it('opens the created partner directly instead of returning to the list', () => {
    expect(proposals).toContain('result.data?.id');
    expect(proposals).toContain('encodeURIComponent(bunshinId)');
    expect(proposals).toContain('?setup=1');
  });

  it('shows progress through the manual-post setup without enabling auto-posting', () => {
    expect(detailPage).toContain('最初の投稿案まで');
    expect(detailPage).toContain('今日の投稿案を受け取る');
    expect(detailPage).toContain('SNSへの投稿はご自身で行います');
  });
});
