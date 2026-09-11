import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const personalHttp = readFileSync(
  new URL('../src/http/daily-missions.ts', import.meta.url),
  'utf8',
);
const serviceHttp = readFileSync(
  new URL('../src/http/service-daily-missions.ts', import.meta.url),
  'utf8',
);
const personalPage = readFileSync(
  new URL('../app/(app)/bunshins/[bunshinId]/page.tsx', import.meta.url),
  'utf8',
);
const personalExperience = readFileSync(
  new URL('../app/(app)/bunshins/[bunshinId]/daily-mission-section.tsx', import.meta.url),
  'utf8',
);
const servicePage = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx', import.meta.url),
  'utf8',
);
const serviceExperience = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/bunshins/[bunshinId]/service-daily-mission-section.tsx',
    import.meta.url,
  ),
  'utf8',
);
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
      expect(source).toContain('window.confirm');
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
    expect(servicePage).toContain('pointWorkspaceId={service.workspaceId}');
    expect(pointsPage).toContain('workspaces.find(({ id }) => id === requestedWorkspaceId)');
  });
});
