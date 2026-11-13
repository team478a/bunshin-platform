import { describe, expect, it } from 'vitest';
import type { DailyMissionView } from '../app/(app)/bunshins/[bunshinId]/daily-mission-section';
import { createExternalAiProductionBrief } from '../app/s/[serviceSlug]/bunshins/[bunshinId]/external-ai-production-brief';

const mission = (overrides: Partial<DailyMissionView> = {}): DailyMissionView => ({
  id: 'mission-a',
  missionDate: '2026-11-13',
  status: 'GENERATED',
  format: 'IMAGE',
  assistanceLevel: 'READY_TO_USE',
  estimatedMinutes: 10,
  topic: '公式イベントを紹介する',
  angle: '本人の落ち着いた言葉で伝える',
  reason: 'イベントを知ってもらうため',
  campaignId: 'campaign-a',
  classification: 'ADVERTISEMENT',
  qualityScore: 95,
  content: {
    imageInstruction: '公式写真を使い、5枚の縦長画像にする',
    caption: '#PR 公式イベントを紹介します',
    slides: [{ headline: '公式イベント', body: '11月開催', visualScene: '公式写真' }],
  },
  decision: 'ACCEPTED',
  rejectionReason: null,
  platform: 'INSTAGRAM',
  postedAt: null,
  feedback: null,
  trendContext: null,
  externalLinkUsage: {
    linkName: '申込ページ',
    insertedUrl: 'https://example.com/member-a',
    expiresAt: null,
    productName: '公式イベント',
    campaignName: '秋の企画',
    advertisingClassification: 'ADVERTISEMENT',
  },
  copyAuthorization: { allowed: true, reason: 'ALLOWED' },
  productionBriefContext: {
    personalStyle: ['専門用語を避ける'],
    campaign: {
      name: '秋の企画',
      theme: '初めての人向け体験会',
      targetSummary: '初参加の人',
      productSummary: '11月開催の体験会',
      providerName: '公式運営会社',
      facts: [{ label: '開催日', value: '2026年11月20日' }],
      allowedAssets: [
        {
          label: '公式メイン画像',
          url: 'https://example.com/official.jpg',
          usageTerms: 'この企画の投稿だけで使用可',
        },
      ],
      requiredDisclosures: ['広告'],
      prohibitedExpressions: ['必ず成功'],
      conditionalExpressions: [{ expression: '条件があります', condition: '無料' }],
    },
  },
  variants: [],
  ...overrides,
});

describe('external AI production brief', () => {
  it('uses only the scoped mission, approved campaign material and safety rules', () => {
    const brief = createExternalAiProductionBrief(mission());
    expect(brief).toContain('Muse・ChatGPT等で共通利用');
    expect(brief).toContain('Instagram');
    expect(brief).toContain('専門用語を避ける');
    expect(brief).toContain('開催日: 2026年11月20日');
    expect(brief).toContain('公式メイン画像: https://example.com/official.jpg');
    expect(brief).toContain('- #PR');
    expect(brief).toContain('- 広告');
    expect(brief).toContain('「必ず成功」は使わない');
    expect(brief).toContain('「無料」に触れる場合は「条件があります」を含める');
    expect(brief).toContain('本人用URL: https://example.com/member-a');
    expect(brief).not.toContain('他社');
  });

  it('fails closed when no official campaign information or material was provided', () => {
    const brief = createExternalAiProductionBrief(
      mission({
        campaignId: null,
        classification: 'ORGANIC',
        externalLinkUsage: null,
        productionBriefContext: { personalStyle: [], campaign: null },
      }),
    );
    expect(brief).toContain('【公式の商品・イベント情報】\n- 指定なし。新しく作らない。');
    expect(brief).toContain('【使用を許可された素材】\n- 指定なし。新しく作らない。');
    expect(brief).toContain('【必須の広告表示】\n- 指定なし。新しく作らない。');
  });
});
