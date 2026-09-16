import { describe, expect, it } from 'vitest';
import {
  drawTarotCard,
  FortuneDailyReadingService,
  FortunePolicyError,
  parseFortuneTheme,
  TAROT_DECK,
  toJapanLocalDate,
  validateFortuneReadingOutput,
} from '../src';
import type { FortuneRepository } from '../src';

describe('fortune core', () => {
  it('defines one stable and complete 78-card deck', () => {
    expect(TAROT_DECK).toHaveLength(78);
    expect(new Set(TAROT_DECK.map((card) => card.code)).size).toBe(78);
  });

  it('draws the card and orientation from the supplied secure random source', () => {
    const values = [77, 1];
    const draw = drawTarotCard({ nextInt: () => values.shift()! });
    expect(draw).toMatchObject({
      card: { code: 'PENTACLES_KING' },
      orientation: 'REVERSED',
    });
  });

  it('rejects an invalid random implementation instead of biasing a draw', () => {
    expect(() => drawTarotCard({ nextInt: () => 78 })).toThrow(FortunePolicyError);
  });

  it('uses the date at request receipt in Japan', () => {
    expect(toJapanLocalDate(new Date('2026-09-16T14:59:59.000Z'))).toBe('2026-09-16');
    expect(toJapanLocalDate(new Date('2026-09-16T15:00:00.000Z'))).toBe('2026-09-17');
  });

  it('accepts only the three approved themes', () => {
    expect(parseFortuneTheme('LOVE')).toBe('LOVE');
    expect(() => parseFortuneTheme('MONEY')).toThrow(FortunePolicyError);
  });

  it('blocks deterministic claims and sales language', () => {
    expect(() =>
      validateFortuneReadingOutput({
        body: '絶対に成功します。',
        actionStep: '今すぐ契約してください。',
      }),
    ).toThrowError(/公開できません/);
  });
});

describe('daily fortune flow', () => {
  it('returns the existing result without drawing again', async () => {
    const reading = {
      id: 'reading-1',
      localDate: '2026-09-17',
      theme: 'LOVE' as const,
      cardCode: 'MAJOR_17',
      cardNameJa: '星',
      orientation: 'UPRIGHT' as const,
      status: 'READY_BASIC' as const,
      title: '希望を育てる日',
      body: '今日は小さな希望を大切にしましょう。',
      actionStep: '気持ちを一つ言葉にしましょう。',
      createdAt: new Date('2026-09-17T00:00:00.000Z'),
    };
    let randomCalls = 0;
    const repository = {
      findReadingForDate: () => Promise.resolve(reading),
    } as unknown as FortuneRepository;
    const service = new FortuneDailyReadingService(repository, {
      nextInt: () => {
        randomCalls += 1;
        return 0;
      },
    });

    await expect(
      service.draw({
        serviceSlug: 'fortune',
        actorUserId: 'user-1',
        theme: 'WORK',
        now: new Date('2026-09-16T15:30:00.000Z'),
      }),
    ).resolves.toEqual(reading);
    expect(randomCalls).toBe(0);
  });
});
