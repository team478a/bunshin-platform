'use client';

import { useState } from 'react';
import type { FortunePersonalFitRating } from '@bunshin/capability-fortune';

const options = [
  { value: 'VERY', label: 'とても合っていた' },
  { value: 'SOMEWHAT', label: 'ある程度合っていた' },
  { value: 'NOT_MUCH', label: 'あまり合っていなかった' },
] as const;

export function FortunePersonalFit({
  serviceSlug,
  readingId,
  rating,
  canRate,
}: {
  serviceSlug: string;
  readingId: string;
  rating: FortunePersonalFitRating | undefined;
  canRate: boolean;
}) {
  const [selected, setSelected] = useState(rating ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  async function save(value: FortunePersonalFitRating | null) {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      const response = await fetch(
        `/api/services/${serviceSlug}/fortune/readings/${readingId}/personal-fit`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rating: value }),
        },
      );
      if (!response.ok) {
        setError(true);
        return;
      }
      setSelected(value);
      setMessage(value ? '評価を保存しました。' : '評価を取り消しました。');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="fortune-action">
      <summary>今回の占いは、あなたに合っていましたか？（任意）</summary>
      <div className="button-row">
        {options.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="button button--secondary"
            aria-pressed={selected === value}
            disabled={busy || !canRate}
            onClick={() => void save(value)}
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
            この評価を取り消す
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          評価を更新できませんでした。もう一度お試しください。
        </p>
      )}
    </details>
  );
}
