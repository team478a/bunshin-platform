import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WeeklyActivitySection } from '../app/s/[serviceSlug]/home/service-home-overview-sections';
import { MemberFeatureLinks } from '../app/s/[serviceSlug]/home/service-home-navigation-sections';

const pageSource = readFileSync(
  new URL('../app/s/[serviceSlug]/home/page.tsx', import.meta.url),
  'utf8',
);
const overviewSource = readFileSync(
  new URL('../app/s/[serviceSlug]/home/service-home-overview-sections.tsx', import.meta.url),
  'utf8',
);
const navigationSource = readFileSync(
  new URL('../app/s/[serviceSlug]/home/service-home-navigation-sections.tsx', import.meta.url),
  'utf8',
);

describe('service home module boundary', () => {
  it('keeps scoped data loading in the server page', () => {
    expect(pageSource).toContain('resolveMemberServiceContext');
    expect(pageSource).toContain('groupMembership.findFirst');
    expect(pageSource).toContain('GetMissionProgress');
    expect(overviewSource).not.toContain('@bunshin/database');
    expect(navigationSource).not.toContain('@bunshin/database');
  });

  it('delegates member progress and navigation to focused presentation modules', () => {
    expect(pageSource).toContain('<WeeklyActivitySection');
    expect(pageSource).toContain('<MemberFeatureLinks');
    expect(overviewSource).toContain('今週の進み具合');
    expect(navigationSource).toContain('運営者用メニュー');
    expect(pageSource).not.toContain('service-home-actions');
  });

  it('shows learning actions instead of social-post partner prompts for training services', () => {
    const overview = renderToStaticMarkup(
      createElement(WeeklyActivitySection, {
        activities: [],
        bunshinCount: 0,
        isBusinessDailyService: false,
        isPersonalLearningAvailable: true,
        isPersonalLearningService: true,
        serviceSlug: 'manaberu-style',
      }),
    );
    const navigation = renderToStaticMarkup(
      createElement(MemberFeatureLinks, {
        imageAvailable: false,
        isBusinessDailyService: false,
        isPersonalLearningAvailable: true,
        isPersonalLearningService: true,
        isServiceOperator: false,
        promptOnlyImages: false,
        rewardsAvailable: false,
        serviceSlug: 'manaberu-style',
        trackingLinkAvailable: false,
        videoAvailable: false,
      }),
    );

    expect(overview).toContain('学習プログラムを開く');
    expect(overview).not.toContain('投稿パートナー');
    expect(navigation).toContain('学習プログラム・課題を見る');
    expect(navigation).not.toContain('投稿パートナー');
  });

  it('shows a preparation-only state for a reserved training service', () => {
    const overview = renderToStaticMarkup(
      createElement(WeeklyActivitySection, {
        activities: [],
        bunshinCount: 0,
        isBusinessDailyService: false,
        isPersonalLearningAvailable: false,
        isPersonalLearningService: true,
        serviceSlug: 'manaberu-style',
      }),
    );
    const navigation = renderToStaticMarkup(
      createElement(MemberFeatureLinks, {
        imageAvailable: false,
        isBusinessDailyService: false,
        isPersonalLearningAvailable: false,
        isPersonalLearningService: true,
        isServiceOperator: false,
        promptOnlyImages: false,
        rewardsAvailable: false,
        serviceSlug: 'manaberu-style',
        trackingLinkAvailable: false,
        videoAvailable: false,
      }),
    );

    expect(overview).toContain('AI研修の準備中です');
    expect(overview).not.toContain('学習プログラムを開く');
    expect(overview).not.toContain('投稿パートナー');
    expect(navigation).toContain('AI研修の準備中です');
    expect(navigation).not.toContain('学習プログラム・課題を見る');
    expect(navigation).not.toContain('投稿パートナー');
  });

  it('recognizes suspended AI Training services and redirects direct social creation access', () => {
    const directCreationPage = readFileSync(
      new URL('../app/s/[serviceSlug]/bunshins/new/page.tsx', import.meta.url),
      'utf8',
    );

    expect(pageSource).toContain("status: { in: ['ACTIVE', 'SUSPENDED'] }");
    expect(pageSource).toContain('.filter(isPersonalLearningServiceProgram)');
    expect(directCreationPage).toContain("status: { in: ['ACTIVE', 'SUSPENDED'] }");
    expect(directCreationPage).toContain('isPersonalLearningServiceProgram(trainingProgram)');
    expect(directCreationPage).toContain('redirect(`/s/${service.configuration.slug}/home`');
  });
});
