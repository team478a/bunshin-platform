import { describe, expect, it } from 'vitest';
import { buildBusinessResponseInsight } from '../app/s/[serviceSlug]/bunshins/[bunshinId]/business-response-insights';

const zero = {
  inquiries: 0,
  reservations: 0,
  visits: 0,
  repeatReservations: 0,
  repeatVisits: 0,
  orders: 0,
  other: 0,
};

describe('business response insights', () => {
  it('guides a posted user to record outcomes when no response is recorded', () => {
    const insight = buildBusinessResponseInsight([
      {
        id: 'one',
        missionDate: '2026-09-14',
        topic: '新商品の紹介',
        postedAt: 'now',
        businessOutcomes: zero,
      },
    ]);

    expect(insight.title).toBe('投稿後の反応を記録しましょう');
    expect(insight.total).toBe(0);
  });

  it('recommends reusing the strongest topic after a customer action', () => {
    const insight = buildBusinessResponseInsight([
      {
        id: 'one',
        missionDate: '2026-09-13',
        topic: 'よくある質問',
        postedAt: 'now',
        businessOutcomes: { ...zero, inquiries: 1 },
      },
      {
        id: 'two',
        missionDate: '2026-09-14',
        topic: 'サービス事例',
        postedAt: 'now',
        businessOutcomes: { ...zero, reservations: 2, orders: 1 },
      },
    ]);

    expect(insight.title).toBe('反応があった内容をもう一度使いましょう');
    expect(insight.bestTopic).toBe('サービス事例');
    expect(insight.total).toBe(4);
  });

  it('turns questions into the next posting material', () => {
    const insight = buildBusinessResponseInsight([
      {
        id: 'one',
        missionDate: '2026-09-14',
        topic: '商品の使い方',
        postedAt: 'now',
        businessOutcomes: { ...zero, inquiries: 2 },
      },
    ]);

    expect(insight.title).toBe('届いた質問を次の投稿にしましょう');
    expect(insight.guidance).toContain('「今日の材料」');
  });

  it('treats explicit repeat visits as customer actions', () => {
    const insight = buildBusinessResponseInsight([
      {
        id: 'one',
        missionDate: '2026-09-14',
        topic: '次回来店までのケア',
        postedAt: 'now',
        businessOutcomes: { ...zero, repeatVisits: 1 },
      },
    ]);

    expect(insight.title).toBe('反応があった内容をもう一度使いましょう');
    expect(insight.bestTopic).toBe('次回来店までのケア');
    expect(insight.total).toBe(1);
  });
});
