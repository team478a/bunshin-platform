'use client';

import { useEffect, useRef, useState } from 'react';
import type { FortuneReadingView } from '@bunshin/capability-fortune';
import type { FortuneCharacter } from '../../../src/fortune/guidance-settings';
import { FortuneCardArtwork, type FortuneCardFace } from './fortune-card-artwork';
import { FortuneMoonGate } from './fortune-moon-gate';
import { FortuneOracleBookOpening } from './fortune-oracle-book';
import './fortune-summoning.css';

type DrawResult = FortuneCardFace & Pick<FortuneReadingView, 'status' | 'deepReading' | 'title'>;
type Scene =
  | { phase: 'pending' }
  | { phase: 'reveal'; card: FortuneCardFace }
  | { phase: 'gate' | 'entrance' }
  | { phase: 'book'; card: FortuneCardFace & Pick<FortuneReadingView, 'title'> };
type Operation = { skipped: boolean; finish?: () => void };

export function useFortuneSummoning(enabled: boolean, deep?: { character?: FortuneCharacter }) {
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

  async function run(request: () => Promise<DrawResult>, complete: () => void) {
    if (operation.current) return;
    const active: Operation = {
      skipped: !enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
    operation.current = active;
    const play = (nextScene: Scene, fallbackMs: number) =>
      new Promise<void>((resolve) => {
        const timeout = window.setTimeout(finish, fallbackMs);
        function finish() {
          window.clearTimeout(timeout);
          resolve();
        }
        active.finish = finish;
        setScene(nextScene);
      });
    if (!active.skipped) setScene({ phase: 'pending' });
    try {
      const { deepReading, cardCode, cardNameJa, orientation, status, title } = await request();
      const card = { cardCode, cardNameJa, orientation };
      if (!active.skipped && status !== 'DELETED' && status !== 'FAILED') {
        await play({ phase: 'reveal', card }, 1250);
        if (deep && status === 'READY_AI' && deepReading) {
          if (!active.skipped) await play({ phase: 'gate' }, 2200);
          if (!active.skipped) await play({ phase: 'entrance' }, 2150);
          if (!active.skipped) await play({ phase: 'book', card: { ...card, title } }, 900);
        }
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
      <FortuneSummoning
        scene={scene}
        skip={skip}
        finish={() => operation.current?.finish?.()}
        {...(deep?.character ? { character: deep.character } : {})}
      />
    ),
  };
}

function FortuneSummoning({
  scene,
  skip,
  finish,
  character,
}: {
  scene: Scene;
  skip: () => void;
  finish: () => void;
  character?: FortuneCharacter;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const transition = stage.current;
    const previous = document.activeElement;
    transition?.scrollIntoView({ block: 'center', behavior: 'instant' });
    skipButton.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && document.activeElement === document.body)
        previous.focus({ preventScroll: true });
    };
  }, []);
  const card = scene.phase === 'reveal' ? scene.card : null;
  const moonPhase = scene.phase === 'gate' || scene.phase === 'entrance' ? scene.phase : null;
  return (
    <div className="fortune-summoning" data-phase={scene.phase} ref={stage}>
      {moonPhase ? (
        <FortuneMoonGate phase={moonPhase} finish={finish} {...(character ? { character } : {})} />
      ) : scene.phase === 'book' ? (
        <FortuneOracleBookOpening card={scene.card} finish={finish} />
      ) : (
        <>
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
                <FortuneCardArtwork card={card} />
              </span>
            )}
          </div>
        </>
      )}
      <p role="status">
        {card
          ? `${card.cardNameJa}・${card.orientation === 'UPRIGHT' ? '正位置' : '逆位置'}`
          : moonPhase === 'gate'
            ? '月の門が開きます'
            : moonPhase === 'entrance'
              ? '深層鑑定をお届けします'
              : scene.phase === 'book'
                ? '神託の書を開いています'
                : 'カードを準備しています…'}
      </p>
      <button type="button" onClick={skip} ref={skipButton}>
        演出をスキップ
      </button>
    </div>
  );
}
