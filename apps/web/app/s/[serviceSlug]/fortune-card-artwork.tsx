'use client';

import { useState } from 'react';
import { TAROT_DECK, type FortuneReadingView } from '@bunshin/capability-fortune';

export type FortuneCardFace = Pick<FortuneReadingView, 'cardCode' | 'cardNameJa' | 'orientation'>;

export function FortuneCardArtwork({ card }: { card: FortuneCardFace }) {
  const [failed, setFailed] = useState(false);
  const knownCard = TAROT_DECK.some((entry) => entry.code === card.cardCode);
  if (!knownCard || failed) return <span>{card.cardNameJa}</span>;
  return (
    <img
      src={`/fortune/tarot/${card.cardCode}.webp`}
      alt=""
      width={300}
      height={527}
      decoding="async"
      data-reversed={card.orientation === 'REVERSED' || undefined}
      onError={() => setFailed(true)}
    />
  );
}
