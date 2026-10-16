import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Route } from 'next';
import { describe, expect, it } from 'vitest';
import {
  ServiceHomeHeader,
  WeeklyActivitySection,
} from '../app/s/[serviceSlug]/home/service-home-overview-sections';
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
  it.each([
    { displayName: 'はっしー', expected: 'はっしーさん、今日も一緒に進めましょう。' },
    { displayName: null, expected: '今日も一緒に進めましょう。' },
    { displayName: ' 　', expected: '今日も一緒に進めましょう。' },
  ])('shows a safe home greeting for display name $displayName', ({ displayName, expected }) => {
    const markup = renderToStaticMarkup(
      createElement(ServiceHomeHeader, {
        displayName: 'マナベルスタイル',
        logoUrl: null,
        memberName: displayName,
      }),
    );

    expect(markup).toContain(expected);
    expect(markup).not.toContain('undefined');
    expect(markup).not.toContain('@');
  });

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
        isPersonalLearningService: true,
        isPersonalLearningReady: true,
        personalLearningPathHref: null,
        serviceSlug: 'manaberu-style',
      }),
    );
    const navigation = renderToStaticMarkup(
      createElement(MemberFeatureLinks, {
        imageAvailable: false,
        isBusinessDailyService: false,
        isPersonalLearningService: true,
        isPersonalLearningReady: true,
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

  it('links the Manaberu home learning action to the authorized dynamic current location', () => {
    const overview = renderToStaticMarkup(
      createElement(WeeklyActivitySection, {
        activities: [],
        bunshinCount: 2,
        isBusinessDailyService: false,
        isPersonalLearningService: true,
        isPersonalLearningReady: true,
        personalLearningPathHref:
          '/s/manaberu-style/programs/00000000-0000-4000-8000-000000000001/learning-request' as Route,
        serviceSlug: 'manaberu-style',
      }),
    );

    expect(overview).toContain('今日の学習を続ける');
    expect(overview).toContain('/learning-request');
    expect(overview).not.toContain('今週の進み具合');
    expect(overview).not.toContain('投稿パートナー');
  });

  it('shows preparation guidance and no social links while an AI training service is paused', () => {
    const overview = renderToStaticMarkup(
      createElement(WeeklyActivitySection, {
        activities: [],
        bunshinCount: 0,
        isBusinessDailyService: false,
        isPersonalLearningService: true,
        isPersonalLearningReady: false,
        personalLearningPathHref: null,
        serviceSlug: 'manaberu-style',
      }),
    );
    const navigation = renderToStaticMarkup(
      createElement(MemberFeatureLinks, {
        imageAvailable: true,
        isBusinessDailyService: false,
        isPersonalLearningService: true,
        isPersonalLearningReady: false,
        isServiceOperator: false,
        promptOnlyImages: true,
        rewardsAvailable: true,
        serviceSlug: 'manaberu-style',
        trackingLinkAvailable: true,
        videoAvailable: true,
      }),
    );

    expect(overview).toContain('AI研修の準備中です');
    expect(overview).not.toContain('/bunshins');
    expect(navigation).toContain('AI研修の準備中です');
    expect(navigation).not.toContain('/bunshins');
    expect(navigation).not.toContain('/activity');
    expect(navigation).not.toContain('/weekly-report');
    expect(navigation).not.toContain('/images');
    expect(navigation).not.toContain('/videos');
  });

  it('classifies only non-archived AI training programs as the current service module', () => {
    expect(pageSource).toContain("status: { not: 'ARCHIVED' }");
    expect(pageSource).toContain(
      'const isPersonalLearningService = personalLearningPrograms.length > 0',
    );
    expect(pageSource).toContain("program.status === 'ACTIVE'");
  });
});
