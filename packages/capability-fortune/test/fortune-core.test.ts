import { describe, expect, it } from 'vitest';
import {
  drawTarotCard,
  FortunePolicyError,
  parseFortuneTheme,
  TAROT_DECK,
  toJapanLocalDate,
  validateFortuneReadingOutput,
} from '../src';

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
