'use client';

import { useState } from 'react';
import type { FortuneReflectionAnswer } from '@bunshin/capability-fortune';

import type { FortuneCharacter } from '../../../src/fortune/guidance-settings';
import { FortuneCharacterBadge } from './fortune-character';

const labels = {
  TRIED_CHANGED: '試して変化があった',
  TRIED_NO_CHANGE: '試した。変化はこれから',
  NOT_TRIED: 'まだ試していない',
} satisfies Record<FortuneReflectionAnswer, string>;

export function FortuneReflection({
  serviceSlug,
  reading,
  character,
}: {
  serviceSlug: string;
  character?: FortuneCharacter;
  reading: {
    id: string;
    actionStep: string | null;
    reflectionPrompt?: string;
    reflectionAnswer?: FortuneReflectionAnswer;
  };
}) {
  const [selected, setSelected] = useState(reading.reflectionAnswer ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(answer: FortuneReflectionAnswer | null) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/services/${serviceSlug}/fortune/readings/${reading.id}/reflection`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answer }),
        },
      );
      if (!response.ok) {
        setError('振り返りを保存できませんでした。');
        return;
      }
      setSelected(answer);
    } catch {
      setError('通信できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="settings-card fortune-action">
      <summary>前回の提案を振り返る（任意）</summary>
      {character && <FortuneCharacterBadge character={character} compact />}
      {reading.actionStep && <p>{reading.actionStep}</p>}
      <p>{reading.reflectionPrompt ?? '前回の提案を試して、何か変化はありましたか？'}</p>
      <div className="button-row">
        {Object.entries(labels).map(([answer, label]) => (
          <button
            key={answer}
            className="button button--secondary"
            type="button"
            aria-pressed={selected === answer}
            disabled={busy}
            onClick={() => void save(answer as FortuneReflectionAnswer)}
          >
            {label}
          </button>
        ))}
        {selected && (
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() => void save(null)}
          >
            回答を削除
          </button>
        )}
      </div>
      {selected && <p role="status">回答を保存しました。次の鑑定に活用します。</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </details>
  );
}
