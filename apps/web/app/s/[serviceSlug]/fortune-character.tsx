'use client';

import { useState } from 'react';
import type { FortuneCharacter } from '../../../src/fortune/guidance-settings';
import '@fontsource-variable/noto-sans-jp';
import './fortune-character.css';

type Expression = keyof FortuneCharacter['expressions'];

export function FortuneCharacterBadge({
  character,
  expression,
  compact = false,
  stage = false,
  fallbackImage,
}: {
  character: FortuneCharacter;
  expression?: Expression;
  compact?: boolean;
  stage?: boolean;
  fallbackImage?: string;
}) {
  if (!character.enabled) return null;
  const sources = [
    ...new Set(
      [
        stage && character.imageUrl,
        expression && character.expressions[expression],
        compact && character.iconUrl,
        character.imageUrl,
        character.iconUrl,
        fallbackImage,
      ].filter((url): url is string => Boolean(url)),
    ),
  ];
  return (
    <div
      className={
        stage
          ? 'fortune-character fortune-character--stage'
          : compact
            ? 'fortune-character fortune-character--compact'
            : 'fortune-character'
      }
    >
      {sources.length > 0 && (
        <CharacterImage key={JSON.stringify(sources)} sources={sources} eager={stage} />
      )}
      <div>
        <p className="eyebrow">AI案内役</p>
        <p className="fortune-character__name">{character.name}</p>
      </div>
    </div>
  );
}

function CharacterImage({ sources, eager }: { sources: string[]; eager: boolean }) {
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  const showNextImage = () => setFailed((index) => (index === failed ? index + 1 : index));
  return (
    <span className="fortune-character__image">
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          width={80}
          height={80}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          ref={(image) => {
            if (image?.complete && image.naturalWidth === 0) showNextImage();
          }}
          onError={showNextImage}
        />
      )}
    </span>
  );
}
