import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
        serviceSlug: 'manaberu-style',
      }),
    );
    const navigation = renderToStaticMarkup(
      createElement(MemberFeatureLinks, {
        imageAvailable: false,
        isBusinessDailyService: false,
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
});
