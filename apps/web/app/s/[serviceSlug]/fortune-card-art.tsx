import type { FortuneReadingView } from '@bunshin/capability-fortune';
import { dailyCardArtwork } from '../../../src/fortune/daily-card-details';

export type FortuneCardFace = Pick<FortuneReadingView, 'cardCode' | 'cardNameJa' | 'orientation'>;

export function FortuneCardBack() {
  return (
    <span className="fortune-card-back" aria-hidden="true">
      <span>✦</span>
    </span>
  );
}

export function FortuneCardArt({ card }: { card: FortuneCardFace }) {
  const artwork = dailyCardArtwork(card.cardCode);
  return artwork ? (
    <img
      className="fortune-card-art"
      src={artwork}
      alt=""
      width={300}
      height={527}
      decoding="async"
      data-reversed={card.orientation === 'REVERSED' || undefined}
    />
  ) : (
    <FortuneCardBack />
  );
}
