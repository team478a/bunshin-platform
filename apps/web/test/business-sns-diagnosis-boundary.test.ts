import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('business SNS diagnosis boundary', () => {
  it('sends a completed business onboarding through the diagnosis', () => {
    const onboarding = source('app/s/[serviceSlug]/onboarding/service-onboarding-form.tsx');
    expect(onboarding).toContain('editMode || isAiTrainingService');
    expect(onboarding).toContain('? `/s/${encodeURIComponent(serviceSlug)}/diagnosis`');
    expect(onboarding).toContain(': `/s/${encodeURIComponent(serviceSlug)}/bunshins/new`');
  });

  it('routes AI Training onboarding and protected social pages back to the service home', () => {
    const onboardingPage = source('app/s/[serviceSlug]/onboarding/page.tsx');
    const createPage = source('app/s/[serviceSlug]/bunshins/new/page.tsx');
    const diagnosis = source('app/s/[serviceSlug]/diagnosis/page.tsx');
    const serviceMode = source('src/services/service-ai-training-mode.ts');

    expect(serviceMode).toContain("status: { not: 'ARCHIVED' }");
    expect(serviceMode).toContain('AI_TRAINING_V1_MODULE_KEY');
    expect(onboardingPage).toContain('hasAiTrainingServiceProgram');
    expect(onboardingPage).toContain('isAiTrainingService={isAiTrainingService}');
    expect(createPage).toContain('hasAiTrainingServiceProgram');
    expect(createPage).toContain('redirect(`/s/${service.configuration.slug}/home`');
    expect(diagnosis).toContain('hasAiTrainingServiceProgram');
    expect(diagnosis).toContain('redirect(`/s/${service.configuration.slug}/home`');
  });

  it('keeps the diagnosis inside the signed-in service and scopes every query', () => {
    const diagnosis = source('app/s/[serviceSlug]/diagnosis/page.tsx');
    expect(diagnosis).toContain('resolveAuthenticatedMemberServicePage');
    expect(diagnosis).toContain('workspaceId: service.workspaceId');
    expect(diagnosis).toContain('groupId: service.serviceId');
    expect(diagnosis).toContain('ownerUserId: actor.userId');
    expect(diagnosis).toContain('SNS集客の準備を確認しました');
  });

  it('provides a direct diagnosis link on the business service home', () => {
    const home = [
      'app/s/[serviceSlug]/home/page.tsx',
      'app/s/[serviceSlug]/home/service-home-overview-sections.tsx',
      'app/s/[serviceSlug]/home/service-home-navigation-sections.tsx',
    ]
      .map(source)
      .join('\n');
    expect(home).toContain('SNS集客の準備を確認する');
    expect(home).toContain('href={`/s/${serviceSlug}/diagnosis` as Route}');
  });
});
