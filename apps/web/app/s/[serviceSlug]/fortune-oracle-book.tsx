import type { ReactNode } from 'react';
import type { FortuneReadingView } from '@bunshin/capability-fortune';
import { FortuneCardArtwork, type FortuneCardFace } from './fortune-card-artwork';
import './fortune-oracle-book.css';

type BookCover = FortuneCardFace & Pick<FortuneReadingView, 'title'>;

function OracleCover({ card, context }: { card: BookCover; context?: string }) {
  return (
    <header className="fortune-oracle-book__cover">
      <div className="fortune-oracle-book__illustration" aria-hidden="true">
        <FortuneCardArtwork card={card} />
      </div>
      <div className="fortune-oracle-book__title">
        <p className="fortune-oracle-book__label">神託の書</p>
        {context && <p className="fortune-oracle-book__context">{context}</p>}
        <h2>{card.title || card.cardNameJa}</h2>
        <p className="fortune-oracle-book__card-name">
          {card.title && `${card.cardNameJa}・`}
          {card.orientation === 'UPRIGHT' ? '正位置' : '逆位置'}
        </p>
      </div>
    </header>
  );
}

export function FortuneOracleBook({
  reading,
  context,
  children,
}: {
  reading: BookCover;
  context: string;
  children: ReactNode;
}) {
  return (
    <article className="fortune-oracle-book">
      <OracleCover card={reading} context={context} />
      <div className="fortune-oracle-book__pages">{children}</div>
    </article>
  );
}

export function FortuneOracleBookOpening({
  card,
  finish,
}: {
  card: BookCover;
  finish: () => void;
}) {
  return (
    <div
      className="fortune-oracle-opening"
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.animationName === 'fortune-oracle-unfold' && event.target === event.currentTarget)
          finish();
      }}
    >
      <OracleCover card={card} />
    </div>
  );
}
