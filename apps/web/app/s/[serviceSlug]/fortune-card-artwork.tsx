'use client';

import { useState } from 'react';
import { TAROT_DECK, type FortuneReadingView } from '@bunshin/capability-fortune';
import './fortune-card-artwork.css';

export type FortuneCardFace = Pick<
  FortuneReadingView,
  'cardCode' | 'cardNameJa' | 'orientation' | 'cardImageUrl'
>;

export function FortuneCardArtwork({
  card,
  framed = true,
}: {
  card: FortuneCardFace;
  framed?: boolean;
}) {
  const knownCard = TAROT_DECK.some((entry) => entry.code === card.cardCode);
  const standard = knownCard ? `/fortune/tarot/${card.cardCode}.webp` : undefined;
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const src = [card.cardImageUrl, standard].find(
    (source) => source && !failedSources.includes(source),
  );
  return (
    <span
      className="fortune-tarot-art"
      data-framed={framed || undefined}
      data-reversed={card.orientation === 'REVERSED' || undefined}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={300}
          height={527}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSources((previous) => [...previous, src])}
        />
      ) : (
        <span className="fortune-tarot-art__fallback">{card.cardNameJa}</span>
      )}
    </span>
  );
}

export function FortuneCardBack() {
  return (
    <span className="fortune-tarot-back" aria-hidden="true">
      <span className="fortune-tarot-back__crest">
        <span className="fortune-tarot-back__moon" />
      </span>
    </span>
  );
}
