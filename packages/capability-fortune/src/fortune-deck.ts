import { TAROT_DECK } from './tarot';

export type FortuneDeckCard = {
  code: string;
  nameJa: string;
  imageUrl: string;
  enabled: boolean;
};

const standardCards = new Map(TAROT_DECK.map((card) => [card.code, card]));

export const isStandardFortuneCard = (code: string) => standardCards.has(code);
export const isCustomFortuneCardCode = (code: string) => /^CUSTOM_[A-Z0-9_]{1,32}$/.test(code);

export function isFortuneCardImageUrl(value: string) {
  if (value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function readFortuneDeck(value: unknown): FortuneDeckCard[] {
  if (!Array.isArray(value)) return [];
  const entries: unknown[] = value;
  return entries.filter((card): card is FortuneDeckCard => {
    if (!card || typeof card !== 'object') return false;
    const { code, nameJa, imageUrl, enabled } = card as Record<string, unknown>;
    return (
      typeof code === 'string' &&
      (isStandardFortuneCard(code) || isCustomFortuneCardCode(code)) &&
      typeof nameJa === 'string' &&
      typeof imageUrl === 'string' &&
      isFortuneCardImageUrl(imageUrl) &&
      typeof enabled === 'boolean'
    );
  });
}

export function fortuneDrawPool(deck: unknown): ReadonlyArray<{ code: string }> {
  const extra = readFortuneDeck(deck).filter(
    (card) => card.enabled && isCustomFortuneCardCode(card.code),
  );
  return [...TAROT_DECK, ...extra];
}
