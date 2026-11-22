import type { FortuneReadingView } from '@bunshin/capability-fortune';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReadingCard } from '../app/s/[serviceSlug]/fortune-ui';

const reading: FortuneReadingView = {
  id: 'oracle-fixture',
  localDate: '2026-11-22',
  theme: 'WORK',
  cardCode: 'MAJOR_14',
  cardNameJa: '節制',
  orientation: 'REVERSED',
  status: 'READY_AI',
  title: '心の余白を整える',
  body: '気になることを一つずつ整理してみましょう。',
  actionStep: '今日できることを一つだけ書きましょう。',
  reflectionPrompt: '書いたあと、気持ちは変わりましたか？',
  deepReading: {
    consultationSummary: '働き方を整理したい',
    importantValue: '家族との時間',
    approvedPerspective: '偏りを見直す視点',
    alternatives: ['日程を調整する。', '一人で考える時間を作る。'],
    actionReason: '優先したいことが確認できます。',
  },
  feedbackRating: null,
  feedbackIssue: null,
  createdAt: new Date('2026-11-22T00:00:00Z'),
};

describe('fortune oracle book', () => {
  it('shows the persisted result and reflection prompt as text in reading order', () => {
    const markup = renderToStaticMarkup(
      <ReadingCard reading={reading} serviceSlug="fortune" oracleBook showFollowUps />,
    );
    expect(markup).toContain('class="fortune-oracle-book"');
    expect(markup).toContain('<h2>心の余白を整える</h2>');
    expect(markup).toContain('/fortune/tarot/MAJOR_14.webp');
    expect(markup).toContain('data-reversed="true"');
    const text = [
      reading.deepReading!.consultationSummary!,
      reading.deepReading!.importantValue!,
      reading.deepReading!.approvedPerspective,
      reading.body!,
      reading.deepReading!.alternatives[0]!,
      reading.actionStep!,
      reading.deepReading!.actionReason,
      reading.reflectionPrompt!,
    ];
    let position = -1;
    for (const part of text) {
      const next = markup.indexOf(part, position + 1);
      expect(next).toBeGreaterThan(position);
      position = next;
    }
  });

  it('keeps the book off unless enabled for a completed deep result', () => {
    const standard = { ...reading };
    delete standard.deepReading;
    const examples = [
      <ReadingCard reading={reading} serviceSlug="fortune" />,
      <ReadingCard reading={standard} serviceSlug="fortune" oracleBook />,
      <ReadingCard
        reading={{ ...reading, status: 'GENERATING' }}
        serviceSlug="fortune"
        oracleBook
      />,
      <ReadingCard reading={reading} serviceSlug="fortune" oracleBook linked />,
    ];
    for (const example of examples) {
      const markup = renderToStaticMarkup(example);
      expect(markup).not.toContain('class="fortune-oracle-book"');
      expect(markup).toContain('class="settings-card fortune-reading-card"');
    }
  });
});
