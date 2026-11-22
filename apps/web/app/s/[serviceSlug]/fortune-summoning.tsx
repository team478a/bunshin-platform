'use client';

import { useEffect, useRef, useState } from 'react';
import { TAROT_DECK, type FortuneReadingView } from '@bunshin/capability-fortune';
import './fortune-summoning.css';

type Card = Pick<FortuneReadingView, 'cardCode' | 'cardNameJa' | 'orientation' | 'status'>;
type Scene = { phase: 'pending' } | { phase: 'reveal'; card: Card };
type Operation = { skipped: boolean; finish?: () => void };

export function useFortuneSummoning(enabled: boolean) {
  const [scene, setScene] = useState<Scene | null>(null);
  const operation = useRef<Operation | null>(null);

  useEffect(
    () => () => {
      const active = operation.current;
      if (active) {
        operation.current = null;
        active.skipped = true;
        active.finish?.();
      }
    },
    [],
  );

  function skip() {
    const active = operation.current;
    if (!active) return;
    active.skipped = true;
    active.finish?.();
    setScene(null);
  }

  async function run(request: () => Promise<Card>, complete: () => void) {
    if (operation.current) return;
    const active: Operation = {
      skipped: !enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
    operation.current = active;
    if (!active.skipped) setScene({ phase: 'pending' });
    try {
      const card = await request();
      if (!active.skipped && card.status !== 'DELETED' && card.status !== 'FAILED') {
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(finish, 1250);
          function finish() {
            window.clearTimeout(timeout);
            resolve();
          }
          active.finish = finish;
          setScene({ phase: 'reveal', card });
        });
      }
      if (operation.current === active) complete();
    } finally {
      if (operation.current === active) {
        operation.current = null;
        setScene(null);
      }
    }
  }

  return {
    run,
    panel: scene && (
      <FortuneSummoning scene={scene} skip={skip} finish={() => operation.current?.finish?.()} />
    ),
  };
}

function FortuneSummoning({
  scene,
  skip,
  finish,
}: {
  scene: Scene;
  skip: () => void;
  finish: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    const transition = stage.current;
    const previous = document.activeElement;
    transition?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    skipButton.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && document.activeElement === document.body)
        previous.focus({ preventScroll: true });
    };
  }, []);
  const card = scene.phase === 'reveal' ? scene.card : null;
  const image =
    card && TAROT_DECK.some((entry) => entry.code === card.cardCode)
      ? `/fortune/tarot/${card.cardCode}.webp`
      : null;
  return (
    <div className="fortune-summoning" data-phase={scene.phase} ref={stage}>
      <div className="fortune-summoning__stars" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <i key={index} style={{ rotate: `${index * 45}deg` }} />
        ))}
      </div>
      <div className="fortune-summoning__orbit" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <i key={index} style={{ rotate: `${index * 60}deg` }} />
        ))}
      </div>
      <div
        className="fortune-summoning__card"
        aria-hidden="true"
        onAnimationEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.animationName === 'fortune-summoning-flip'
          )
            finish();
        }}
      >
        <span className="fortune-summoning__back">✦</span>
        {card && (
          <span className="fortune-summoning__face">
            {image && !imageFailed ? (
              <img
                src={image}
                alt=""
                width={300}
                height={527}
                data-reversed={card.orientation === 'REVERSED' || undefined}
                onError={() => setImageFailed(true)}
              />
            ) : (
              card.cardNameJa
            )}
          </span>
        )}
      </div>
      <p role="status">
        {card
          ? `${card.cardNameJa}・${card.orientation === 'UPRIGHT' ? '正位置' : '逆位置'}`
          : 'カードを準備しています…'}
      </p>
      <button type="button" onClick={skip} ref={skipButton}>
        演出をスキップ
      </button>
    </div>
  );
}
