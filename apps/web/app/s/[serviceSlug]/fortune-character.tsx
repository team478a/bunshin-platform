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
  fallbackImage,
}: {
  character: FortuneCharacter;
  expression?: Expression;
  compact?: boolean;
  fallbackImage?: string;
}) {
  if (!character.enabled) return null;
  const sources = [
    ...new Set(
      [
        expression && character.expressions[expression],
        compact && character.iconUrl,
        character.imageUrl,
        character.iconUrl,
        fallbackImage,
      ].filter((url): url is string => Boolean(url)),
    ),
  ];
  return (
    <div className={compact ? 'fortune-character fortune-character--compact' : 'fortune-character'}>
      {sources.length > 0 && <CharacterImage key={JSON.stringify(sources)} sources={sources} />}
      <div>
        <p className="eyebrow">AI案内役</p>
        <p className="fortune-character__name">{character.name}</p>
      </div>
    </div>
  );
}

function CharacterImage({ sources }: { sources: string[] }) {
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  return (
    <span className="fortune-character__image">
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          width={80}
          height={80}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed((index) => index + 1)}
        />
      )}
    </span>
  );
}
