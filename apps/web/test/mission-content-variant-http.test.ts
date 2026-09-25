import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const personalHttp = readFileSync(
  new URL('../src/http/daily-missions.ts', import.meta.url),
  'utf8',
);
const serviceHttp = [
  'service-daily-missions.ts',
  'service-daily-mission-http-core.ts',
  'service-daily-mission-generation.ts',
  'service-daily-mission-variants.ts',
]
  .map((file) => readFileSync(new URL(`../src/http/${file}`, import.meta.url), 'utf8'))
  .join('\n');
const personalPage = ['bunshin-page-data.ts', 'bunshin-page-view-model.ts']
  .map((file) =>
    readFileSync(new URL(`../app/(app)/bunshins/[bunshinId]/${file}`, import.meta.url), 'utf8'),
  )
  .join('\n');
const personalExperience = [
  'daily-mission-section.tsx',
  'personal-daily-mission-controller.ts',
  'personal-daily-mission-list.tsx',
  'personal-daily-mission-overview.tsx',
]
  .map((file) =>
    readFileSync(new URL(`../app/(app)/bunshins/[bunshinId]/${file}`, import.meta.url), 'utf8'),
  )
  .join('\n');
const servicePage = ['service-bunshin-detail-data.ts', 'service-bunshin-detail-view.tsx']
  .map((file) =>
    readFileSync(
      new URL(`../app/s/[serviceSlug]/bunshins/[bunshinId]/${file}`, import.meta.url),
      'utf8',
    ),
  )
  .join('\n');
const serviceExperience = [
  'service-daily-mission-section.tsx',
  'service-daily-mission-controller.ts',
  'service-daily-mission-list.tsx',
  'service-daily-mission-card.tsx',
  'service-daily-mission-detail.tsx',
  'service-daily-mission-image-guide.tsx',
  'service-daily-mission-accepted.tsx',
]
  .map((file) =>
    readFileSync(
      new URL(`../app/s/[serviceSlug]/bunshins/[bunshinId]/${file}`, import.meta.url),
      'utf8',
    ),
  )
  .join('\n');
const pointsPage = readFileSync(new URL('../app/(app)/points/page.tsx', import.meta.url), 'utf8');

describe('mission content variant HTTP and UI boundary', () => {
  it.each([personalHttp, serviceHttp])(
    'validates generation and selection mutations with same-origin protection',
    (source) => {
      expect(source).toContain('variantGenerationSchema');
      expect(source).toContain('variantSelectionSchema');
      expect(source).toContain('requireSameOrigin(request)');
      expect(source).toContain('ListMissionContentVariants');
      expect(source).toContain('SelectMissionContentVariant');
      expect(source).toContain('generatePointFundedMissionContentVariant');
      expect(source).toContain('acceptedPointCost: z.number().int().positive()');
    },
  );

  it('derives the service scope on the server and enables safe service generation', () => {
    expect(serviceHttp).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(serviceHttp).toContain('groupId: service.serviceId');
    expect(serviceHttp).toContain('serviceSafeMode: true');
    expect(serviceHttp).not.toContain('groupId: z.');
    expect(serviceHttp).not.toContain('workspaceId: z.');
  });

  it.each([personalPage, servicePage])('loads variants through the scoped repository', (source) => {
    expect(source).toContain('ListMissionContentVariants');
    expect(source).toContain('PrismaMissionContentVariantRepository');
    expect(source).toContain('selectedAt: selectedAt?.toISOString() ?? null');
    expect(source).toContain('ALTERNATIVE_PLAN_GENERATION');
    expect(source).toContain('PrismaPointRedemptionRepository');
  });

  it.each([personalExperience, serviceExperience])(
    'shows generation, correction and explicit selection actions',
    (source) => {
      expect(source).toContain('別の案を見る');
      expect(source).toContain('内容を直す');
      expect(source).toContain('この案を使う');
      expect(source).toContain('missionWithSelectedVariant');
      expect(source).toContain('/variants');
      expect(source).toContain('acceptedPointCost: variantPointCost');
      expect(source).toContain('role="alertdialog"');
      expect(source).toContain('WPを使いますか？');
      expect(source).not.toContain('window.confirm');
      expect(source).toContain('作成に使ったWPは、失敗した場合に戻ります。');
    },
  );

  it.each([personalExperience, serviceExperience])(
    'explains that a completed post is recorded by self-report',
    (source) => {
      expect(source).toContain('SNSへ実際に投稿した後で押してください。');
      expect(source).toContain('投稿したかどうかは自動では確認されず、自己申告で記録されます。');
    },
  );

  it('opens the balance for the workspace charged by the variant', () => {
    expect(personalExperience).toContain('/points?workspaceId=');
    expect(serviceExperience).toContain('pointWorkspaceId');
    expect(serviceExperience).toContain('&serviceSlug=');
    expect(servicePage).toContain('pointWorkspaceId={service.workspaceId}');
    expect(servicePage).toContain('serviceSlug={service.configuration.slug}');
    expect(pointsPage).toContain('selectRewardsServiceContext');
  });
});
