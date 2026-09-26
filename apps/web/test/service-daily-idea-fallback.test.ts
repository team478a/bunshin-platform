import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

vi.mock('server-only', () => ({}));

import {
  buildServiceDailyIdeaFallback,
  shouldUseServiceDailyIdeaFallback,
} from '../src/services/service-daily-idea-fallback';
import { inspectDailyMissionContent } from '../src/services/daily-mission-content-quality';

describe('service daily idea fallback', () => {
  const personalized = {
    platform: 'INSTAGRAM',
    socialPurpose: '歴史好きへ分かりやすく届ける',
    strategyTarget: '地域の歴史に興味がある初心者',
    strategyPositioning: '難しい史料を身近な言葉で紹介します。',
    weeklyGoal: '保存される歴史情報を届ける',
    weeklyAngle: '城跡で最初に見る場所',
    bunshinObjective: '歴史を身近に感じてもらう',
    bunshinAudience: '歴史に興味を持ち始めた人',
  };

  it('builds a deterministic ready-to-post fallback from service business facts', () => {
    const first = buildServiceDailyIdeaFallback({
      missionDate: '2026-09-07',
      industry: '飲食',
      businessName: 'テスト食堂',
      productService: '日替わり定食',
      targetAudience: '近隣で働く人',
      businessFeatures: '毎朝仕込んだ料理を提供しています',
      category: 'HELPFUL_EXPERTISE',
      ...personalized,
    });
    const second = buildServiceDailyIdeaFallback({
      missionDate: '2026-09-07',
      industry: '飲食',
      businessName: 'テスト食堂',
      productService: '日替わり定食',
      targetAudience: '近隣で働く人',
      businessFeatures: '毎朝仕込んだ料理を提供しています',
      category: 'HELPFUL_EXPERTISE',
      ...personalized,
    });
    expect(first).toEqual(second);
    expect(first.body).toContain('毎朝仕込んだ料理を提供しています');
    expect(first.body).not.toContain('紹介しましょう');
    expect(first.hashtags).toEqual(['#テスト食堂', '#飲食', '#日替わり定食']);
    expect(first.photoInstruction).toContain('日替わり定食');
    expect(first.reason).toContain('business-daily-personalized-fallback-v6-grounded-knowledge');
    expect(first.body).toContain(personalized.strategyTarget);
    expect(first.reason).toContain(personalized.socialPurpose);
  });

  it('uses an approved knowledge fact and records its source in the fallback reason', () => {
    const result = buildServiceDailyIdeaFallback({
      missionDate: '2026-09-26',
      industry: '情報発信',
      businessName: '千ノ国メディア',
      productService: 'ORI会員向け情報',
      targetAudience: '歴史に興味がある人',
      approvedFact: 'ORIでは承認済みの地域史資料を会員向けに紹介しています。',
      approvedFactLabel: 'ORI公式資料',
      category: 'HELPFUL_EXPERTISE',
      ...personalized,
    });

    expect(result.body).toContain('承認済みの地域史資料');
    expect(result.reason).toContain('ORI公式資料');
    expect(result.topic).toContain(personalized.weeklyAngle);
  });

  it('softens the fallback CTA after the user rejects sales-heavy content', () => {
    const result = buildServiceDailyIdeaFallback({
      missionDate: '2026-09-22',
      industry: '情報発信',
      businessName: '千ノ国メディア',
      productService: 'ORI会員向け情報',
      targetAudience: '歴史に興味がある人',
      businessFeatures: 'ORIの公式情報を分かりやすく届けています',
      category: 'HELPFUL_EXPERTISE',
      feedbackPreference: 'SOFT_CTA',
      ...personalized,
    });

    expect(result.cta).toContain('保存');
    expect(result.body).toContain('保存');
    expect(result.body).not.toContain('お気軽にお尋ねください');
    expect(result.reason).toContain('SOFT_CTA');
  });

  it('does not mistake a changed angle or image for new substantive content', () => {
    const input = {
      industry: '情報発信',
      businessName: '千ノ国メディア',
      productService: '会員向け情報',
      targetAudience: '会員',
      businessFeatures: '分かりやすい情報を届けています',
      category: 'HELPFUL_EXPERTISE' as const,
      ...personalized,
    };
    const first = buildServiceDailyIdeaFallback({ ...input, missionDate: '2026-09-17' });
    const anotherParticipant = buildServiceDailyIdeaFallback({
      ...input,
      missionDate: '2026-09-17',
      platform: 'THREADS',
      socialPurpose: 'ORIの体験を言葉で共有する',
      strategyTarget: 'メタバース経験がありORIに関心がある人',
      strategyPositioning: 'オンライン体験からORIの価値を紹介します。',
      bunshinObjective: 'ORIを自分の言葉で紹介する',
      bunshinAudience: 'メタバースに関心がある人',
    });
    expect(anotherParticipant.body).not.toBe(first.body);
    expect(anotherParticipant.body).toContain('メタバース経験がありORIに関心がある人');
    expect(first.body).toContain('地域の歴史に興味がある初心者');

    const asContent = (idea: typeof first) => ({
      body: idea.body,
      threadParts: [],
      cta: 'お問い合わせください。',
      caption: idea.body,
      hashtags: idea.hashtags,
      photoInstruction: idea.photoInstruction,
    });
    expect(
      inspectDailyMissionContent({
        content: asContent(first),
        recentMissions: [
          {
            missionDate: '2026-09-17',
            topic: first.topic,
            angle: first.angle,
            content: asContent(first),
          },
        ],
      })?.code,
    ).toMatch(/EXACT_RECENT_CONTENT|SUBSTANTIAL_RECENT_OVERLAP/);
  });

  it('accepts a different approved fact and weekly-plan question for the same participant', () => {
    const shared = {
      missionDate: '2026-09-18',
      industry: '情報発信',
      businessName: '千ノ国メディア',
      productService: 'ORI会員向け地域史資料',
      targetAudience: '歴史を学び始めた人',
      category: 'HELPFUL_EXPERTISE' as const,
      ...personalized,
    };
    const first = buildServiceDailyIdeaFallback({
      ...shared,
      weeklyGoal: '城跡を見る最初の手がかりを届ける',
      weeklyAngle: '石垣の角から積み直しの時期を考える',
      approvedFact: '石垣の角には、異なる時期の積み方が残ることがあります。',
      approvedFactLabel: '承認済み城跡資料',
    });
    const second = buildServiceDailyIdeaFallback({
      ...shared,
      weeklyGoal: '古文書を読む順番を届ける',
      weeklyAngle: '書状の日付と季節の記述を照らし合わせる',
      approvedFact: '書状の日付と季節の記述は、出来事の時期を考える手がかりになります。',
      approvedFactLabel: '承認済み古文書資料',
    });
    const content = (idea: typeof first) => ({
      body: idea.body,
      threadParts: [],
      cta: idea.cta,
      caption: idea.body,
      hashtags: idea.hashtags,
      photoInstruction: idea.photoInstruction,
    });

    expect(
      inspectDailyMissionContent({
        content: content(second),
        recentMissions: [
          {
            missionDate: '2026-09-17',
            topic: first.topic,
            angle: first.angle,
            content: content(first),
          },
        ],
      }),
    ).toBeNull();
  });

  it('applies service terminology to the fallback path', () => {
    const result = buildServiceDailyIdeaFallback({
      missionDate: '2026-09-21',
      industry: '情報発信',
      businessName: '千ノ国メディア',
      productService: 'OVE会員向け情報',
      targetAudience: 'OVEを学ぶ会員',
      businessFeatures: 'OVEの考え方を届けています',
      serviceSlug: 'sennokuni-media',
      ...personalized,
    });

    expect(JSON.stringify(result)).not.toMatch(/OVE/i);
    expect(result.body).toContain('ORI');
    expect(result.photoInstruction).toContain('ORI');
  });

  it('falls back only for provider, quality and quota failures', () => {
    expect(
      shouldUseServiceDailyIdeaFallback(
        new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'provider unavailable'),
      ),
    ).toBe(true);
    expect(
      shouldUseServiceDailyIdeaFallback(
        new ApplicationError('CONTENT_REJECTED', 'candidate duplicates recent content'),
      ),
    ).toBe(false);
    expect(
      shouldUseServiceDailyIdeaFallback(
        new ApplicationError('FORBIDDEN', 'service monthly AI generation limit reached'),
      ),
    ).toBe(true);
    expect(
      shouldUseServiceDailyIdeaFallback(new ApplicationError('NOT_FOUND', 'profile missing')),
    ).toBe(false);
  });
});
